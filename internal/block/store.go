package block

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Store is an in-memory view of the on-disk block library. Blocks live one per
// file under a root directory so that every edit is an independently reviewable
// git diff.
type Store struct {
	root   string
	blocks map[string]*Block
	paths  map[string]string
}

// Load reads every .yaml file beneath root into a Store.
func Load(root string) (*Store, error) {
	store := &Store{
		root:   root,
		blocks: map[string]*Block{},
		paths:  map[string]string{},
	}

	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			return nil
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var loaded Block
		if err := yaml.Unmarshal(raw, &loaded); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		if err := loaded.Validate(); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		if existing, clash := store.paths[loaded.ID]; clash {
			return fmt.Errorf("duplicate block id %q in %s and %s", loaded.ID, existing, path)
		}
		store.blocks[loaded.ID] = &loaded
		store.paths[loaded.ID] = path
		return nil
	})
	if err != nil {
		return nil, err
	}
	return store, nil
}

// Get returns a block by id.
func (s *Store) Get(id string) (*Block, bool) {
	found, ok := s.blocks[id]
	return found, ok
}

// All returns every block sorted by id, for deterministic listings.
func (s *Store) All() []*Block {
	all := make([]*Block, 0, len(s.blocks))
	for _, b := range s.blocks {
		all = append(all, b)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].ID < all[j].ID })
	return all
}

// ByKind returns every block of a kind, sorted by id.
func (s *Store) ByKind(kind Kind) []*Block {
	var matching []*Block
	for _, b := range s.All() {
		if b.Kind == kind {
			matching = append(matching, b)
		}
	}
	return matching
}

// Len reports how many blocks are loaded.
func (s *Store) Len() int { return len(s.blocks) }

// Save writes a block back to disk, creating the file if the block is new.
// Blocks are filed under a per-kind directory so the library stays browsable as
// it grows.
func (s *Store) Save(b *Block) error {
	if err := b.Validate(); err != nil {
		return err
	}
	path, known := s.paths[b.ID]
	if !known {
		path = filepath.Join(s.root, string(b.Kind), fileNameFor(b.ID))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
	}

	encoded, err := marshal(b)
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		return err
	}
	s.blocks[b.ID] = b
	s.paths[b.ID] = path
	return nil
}

// Path returns the on-disk location of a block, for error messages and for the
// builder UI's "open in editor" affordance.
func (s *Store) Path(id string) string { return s.paths[id] }

func marshal(b *Block) ([]byte, error) {
	var builder strings.Builder
	encoder := yaml.NewEncoder(&builder)
	encoder.SetIndent(2)
	if err := encoder.Encode(b); err != nil {
		return nil, err
	}
	if err := encoder.Close(); err != nil {
		return nil, err
	}
	return []byte(builder.String()), nil
}

// fileNameFor turns a block id into a filesystem-safe basename. Block ids carry
// characters that are awkward in paths — "pr:WasmEdge/WasmEdge#4470" — so
// everything outside the safe set collapses to a dash.
func fileNameFor(id string) string {
	var name strings.Builder
	for _, symbol := range strings.ToLower(id) {
		switch {
		case symbol >= 'a' && symbol <= 'z', symbol >= '0' && symbol <= '9':
			name.WriteRune(symbol)
		default:
			name.WriteRune('-')
		}
	}
	collapsed := strings.Trim(collapseDashes(name.String()), "-")
	return collapsed + ".yaml"
}

func collapseDashes(value string) string {
	for strings.Contains(value, "--") {
		value = strings.ReplaceAll(value, "--", "-")
	}
	return value
}
