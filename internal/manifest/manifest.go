// Package manifest describes a single résumé as an ordered selection of blocks.
//
// A manifest never contains content of its own beyond overrides. It names blocks,
// picks a variant for each, and orders them into sections. That separation is
// what lets one edit to a block ripple into every résumé that references it,
// while an override stays pinned to the one résumé that needed it.
package manifest

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Entry selects one block for one résumé.
type Entry struct {
	Block   string `yaml:"block" json:"block"`
	Variant string `yaml:"variant,omitempty" json:"variant,omitempty"`

	// Override is scoped to this résumé alone. The builder writes here when you
	// choose "just this résumé"; promoting an edit moves it out of here and into
	// the block itself.
	Override map[string]any `yaml:"override,omitempty" json:"override,omitempty"`

	// Note records why an override exists, so a future reader knows whether it
	// was a deliberate reframing or a one-off squeeze to save a line.
	Note string `yaml:"note,omitempty" json:"note,omitempty"`
}

// Layout selects the wrapper template for a section. The hand-curated résumés
// present the same contribution data three different ways, so layout is a
// per-section choice rather than a property of the blocks.
type Layout string

const (
	// LayoutPlain stacks blocks with no surrounding rule.
	LayoutPlain Layout = "plain"
	// LayoutBoxed wraps the whole section in a single bordered table.
	LayoutBoxed Layout = "boxed"
	// LayoutEntries renders each block as a bolded entry with its own bullets.
	LayoutEntries Layout = "entries"
)

// Section is a headed run of blocks.
type Section struct {
	Heading string  `yaml:"heading" json:"heading"`
	Layout  Layout  `yaml:"layout,omitempty" json:"layout,omitempty"`
	Blocks  []Entry `yaml:"blocks" json:"blocks"`
}

// Manifest is one résumé.
type Manifest struct {
	ID    string `yaml:"id" json:"id"`
	Label string `yaml:"label" json:"label"`

	// Output is the PDF path relative to the repository root.
	Output string `yaml:"output" json:"output"`

	// MaxPages fails the build when the compiled PDF runs longer. This is the
	// guardrail that turns "keep it to one page" from a habit into a check.
	MaxPages int `yaml:"maxPages,omitempty" json:"maxPages,omitempty"`

	Sections []Section `yaml:"sections" json:"sections"`
}

// Load reads a single manifest file.
func Load(path string) (*Manifest, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var loaded Manifest
	if err := yaml.Unmarshal(raw, &loaded); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if err := loaded.Validate(); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &loaded, nil
}

// LoadAll reads every manifest in a directory, sorted by id.
func LoadAll(root string) ([]*Manifest, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	var manifests []*Manifest
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}
		loaded, err := Load(filepath.Join(root, entry.Name()))
		if err != nil {
			return nil, err
		}
		manifests = append(manifests, loaded)
	}
	sort.Slice(manifests, func(i, j int) bool { return manifests[i].ID < manifests[j].ID })
	return manifests, nil
}

// Save writes a manifest back to disk, preserving it as a reviewable diff.
func (m *Manifest) Save(path string) error {
	if err := m.Validate(); err != nil {
		return err
	}
	var builder strings.Builder
	encoder := yaml.NewEncoder(&builder)
	encoder.SetIndent(2)
	if err := encoder.Encode(m); err != nil {
		return err
	}
	if err := encoder.Close(); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(builder.String()), 0o644)
}

// Validate checks the manifest is renderable before any LaTeX runs.
func (m *Manifest) Validate() error {
	if m.ID == "" {
		return fmt.Errorf("manifest is missing an id")
	}
	if m.Output == "" {
		return fmt.Errorf("manifest %s: output path is required", m.ID)
	}
	// Output arrives from the builder over HTTP and is later handed straight to
	// os.MkdirAll and os.WriteFile, so an absolute path or a ".." segment would
	// write outside the repository. Confine it to a relative path below
	// public/resume, which is the only place a built résumé belongs.
	if err := validOutput(m.Output); err != nil {
		return fmt.Errorf("manifest %s: %w", m.ID, err)
	}
	if len(m.Sections) == 0 {
		return fmt.Errorf("manifest %s: has no sections", m.ID)
	}

	seen := map[string]string{}
	for index, section := range m.Sections {
		switch section.Layout {
		case "", LayoutPlain, LayoutBoxed, LayoutEntries:
		default:
			return fmt.Errorf("manifest %s: section %d has unknown layout %q", m.ID, index, section.Layout)
		}
		for _, entry := range section.Blocks {
			if entry.Block == "" {
				return fmt.Errorf("manifest %s: section %q has an entry with no block id", m.ID, section.Heading)
			}
			// Spacers exist to be repeated — one between every pair of sections
			// is normal — so they are the single exception to the rule below.
			if strings.HasPrefix(entry.Block, "spacer:") {
				continue
			}
			// Any other block appearing twice on one résumé is a mistake, and it
			// is easy to introduce when reordering sections by hand.
			if where, duplicate := seen[entry.Block]; duplicate {
				return fmt.Errorf("manifest %s: block %s appears twice (in %q and %q)",
					m.ID, entry.Block, where, section.Heading)
			}
			seen[entry.Block] = section.Heading
		}
	}
	return nil
}

// OutputDir is the only directory a built résumé may be written to.
const OutputDir = "public/resume"

func validOutput(output string) error {
	if filepath.IsAbs(output) || strings.HasPrefix(output, "~") {
		return fmt.Errorf("output %q must be a relative path", output)
	}
	if strings.ContainsRune(output, '\x00') {
		return fmt.Errorf("output contains a null byte")
	}
	cleaned := filepath.ToSlash(filepath.Clean(output))
	if cleaned != filepath.ToSlash(output) {
		return fmt.Errorf("output %q must already be in its simplest form (got %q)", output, cleaned)
	}
	if !strings.HasPrefix(cleaned, OutputDir+"/") {
		return fmt.Errorf("output %q must sit under %s/", output, OutputDir)
	}
	// Clean has already resolved any interior "..", so a survivor means the path
	// tried to climb out of the prefix.
	if strings.Contains(cleaned, "../") {
		return fmt.Errorf("output %q must not traverse upward", output)
	}
	if !strings.HasSuffix(cleaned, ".pdf") {
		return fmt.Errorf("output %q must end in .pdf", output)
	}
	return nil
}

// BlockIDs lists every block the manifest references, in render order.
func (m *Manifest) BlockIDs() []string {
	var ids []string
	for _, section := range m.Sections {
		for _, entry := range section.Blocks {
			ids = append(ids, entry.Block)
		}
	}
	return ids
}
