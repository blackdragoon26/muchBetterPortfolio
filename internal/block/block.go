// Package block defines the résumé block store: the single source of truth for
// every piece of content that can appear on a résumé.
//
// A block owns its data in two separate maps. Machine holds facts imported from
// GitHub (star counts, merge dates, diff sizes) and is replaced wholesale on
// every sync. Content holds prose written by a human and is never touched by the
// importer. Keeping them in separate maps means the nightly sync cannot clobber
// hand-written copy even by accident — there is no field-level rule to get wrong.
package block

import (
	"fmt"
	"sort"
	"strings"
)

// Kind identifies which template renders a block.
type Kind string

const (
	KindHeader       Kind = "header"
	KindEducation    Kind = "education"
	KindExperience   Kind = "experience"
	KindContribution Kind = "contribution"
	KindProject      Kind = "project"
	KindSkills       Kind = "skills"
	KindLeadership   Kind = "leadership"
	KindPublication  Kind = "publication"
	KindCertificates Kind = "certificates"
	KindSpacer       Kind = "spacer"
)

// AllKinds lists every valid kind, used for validation and for the builder UI's
// block palette.
var AllKinds = []Kind{
	KindHeader, KindEducation, KindExperience, KindContribution,
	KindProject, KindSkills, KindLeadership, KindPublication, KindCertificates,
	KindSpacer,
}

func (k Kind) Valid() bool {
	for _, candidate := range AllKinds {
		if k == candidate {
			return true
		}
	}
	return false
}

// Source records where a block originally came from. It drives importer
// behaviour: github blocks get their Machine map refreshed every sync, manual
// blocks are left entirely alone.
type Source string

const (
	SourceManual Source = "manual" // authored by hand, never imported
	SourceReadme Source = "readme" // discovered in the profile README Wall of Fame
	SourceGitHub Source = "github" // discovered via the GitHub API
)

// Block is one reusable unit of résumé content.
type Block struct {
	ID   string `yaml:"id"`
	Kind Kind   `yaml:"kind"`

	// Source and Tags steer the importer and the preset autofill respectively.
	Source Source   `yaml:"source"`
	Tags   []string `yaml:"tags,omitempty"`

	// Machine is owned by the importer. Anything here is overwritten on sync.
	Machine map[string]any `yaml:"machine,omitempty"`

	// Content is owned by a human. The importer never writes to it.
	Content map[string]any `yaml:"content"`

	// Variants are named partial overlays on Content, used to fit a block into a
	// tighter space without losing the full-length copy. Every variant is
	// reusable across résumés, which is what makes a one-off squeeze permanent.
	Variants map[string]map[string]any `yaml:"variants,omitempty"`
}

// VariantFull is the implicit variant name for a block's base Content.
const VariantFull = "full"

// VariantNames returns the selectable variants for a block, always beginning
// with "full" and with the rest sorted for stable UI ordering.
func (b *Block) VariantNames() []string {
	names := []string{VariantFull}
	for name := range b.Variants {
		if name != VariantFull {
			names = append(names, name)
		}
	}
	sort.Strings(names[1:])
	return names
}

// Resolve produces the effective content for a block by layering, in order:
// Machine facts, human Content, the selected variant, and finally any overrides
// scoped to a single résumé. Later layers win.
//
// This layering is the whole feature: editing at the override layer changes one
// résumé, promoting the same edit to the variant layer changes every résumé that
// opts into that variant, and promoting it to Content changes every résumé that
// has not overridden the field.
func (b *Block) Resolve(variant string, override map[string]any) (map[string]any, error) {
	if variant != "" && variant != VariantFull {
		if _, ok := b.Variants[variant]; !ok {
			return nil, fmt.Errorf("block %s: unknown variant %q (have %s)",
				b.ID, variant, strings.Join(b.VariantNames(), ", "))
		}
	}

	resolved := mergeInto(map[string]any{}, b.Machine)
	resolved = mergeInto(resolved, b.Content)
	if variant != "" && variant != VariantFull {
		resolved = mergeInto(resolved, b.Variants[variant])
	}
	resolved = mergeInto(resolved, override)
	return resolved, nil
}

// mergeInto deep-merges src over dst and returns dst. Maps merge key by key;
// every other type, slices included, replaces wholesale. Replacing slices is
// deliberate: a "tight" variant that lists two bullets means exactly those two
// bullets, not two appended to the base three.
func mergeInto(dst, src map[string]any) map[string]any {
	for key, value := range src {
		if nested, ok := value.(map[string]any); ok {
			if existing, ok := dst[key].(map[string]any); ok {
				dst[key] = mergeInto(copyMap(existing), nested)
				continue
			}
			dst[key] = copyMap(nested)
			continue
		}
		dst[key] = value
	}
	return dst
}

func copyMap(source map[string]any) map[string]any {
	clone := make(map[string]any, len(source))
	for key, value := range source {
		if nested, ok := value.(map[string]any); ok {
			clone[key] = copyMap(nested)
			continue
		}
		clone[key] = value
	}
	return clone
}

// HasTag reports whether the block carries the given tag, used by preset
// autofill to propose a starting block set.
func (b *Block) HasTag(tag string) bool {
	for _, candidate := range b.Tags {
		if strings.EqualFold(candidate, tag) {
			return true
		}
	}
	return false
}

// Validate checks the invariants the renderer depends on.
func (b *Block) Validate() error {
	if b.ID == "" {
		return fmt.Errorf("block is missing an id")
	}
	if !b.Kind.Valid() {
		return fmt.Errorf("block %s: unknown kind %q", b.ID, b.Kind)
	}
	if len(b.Content) == 0 {
		return fmt.Errorf("block %s: content is empty", b.ID)
	}
	if _, reserved := b.Variants[VariantFull]; reserved {
		return fmt.Errorf("block %s: %q is reserved for base content, name the variant something else", b.ID, VariantFull)
	}
	return nil
}
