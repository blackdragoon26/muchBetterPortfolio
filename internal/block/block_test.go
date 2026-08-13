package block

import "testing"

func sample() *Block {
	return &Block{
		ID:     "project:demo",
		Kind:   KindProject,
		Source: SourceReadme,
		Machine: map[string]any{
			"stars":      12,
			"repository": "user/demo",
		},
		Content: map[string]any{
			"title":     "Demo",
			"objective": "Full objective.",
			"approach":  []any{"first", "second", "third"},
		},
		Variants: map[string]map[string]any{
			"tight": {
				"objective": "Short objective.",
				"approach":  []any{"only one"},
			},
		},
	}
}

func TestResolveLayering(t *testing.T) {
	t.Run("base content sits on top of machine facts", func(t *testing.T) {
		resolved, err := sample().Resolve("", nil)
		if err != nil {
			t.Fatal(err)
		}
		if resolved["objective"] != "Full objective." {
			t.Errorf("objective = %v", resolved["objective"])
		}
		// Machine facts stay visible to templates rather than being shadowed away.
		if resolved["stars"] != 12 {
			t.Errorf("stars = %v, want the imported value to survive", resolved["stars"])
		}
	})

	t.Run("a variant overlays only the fields it names", func(t *testing.T) {
		resolved, err := sample().Resolve("tight", nil)
		if err != nil {
			t.Fatal(err)
		}
		if resolved["objective"] != "Short objective." {
			t.Errorf("objective = %v, want the variant's", resolved["objective"])
		}
		// title is untouched by the variant and must fall through from Content.
		if resolved["title"] != "Demo" {
			t.Errorf("title = %v, want it to fall through", resolved["title"])
		}
	})

	t.Run("a variant list replaces rather than appends", func(t *testing.T) {
		resolved, err := sample().Resolve("tight", nil)
		if err != nil {
			t.Fatal(err)
		}
		approach, ok := resolved["approach"].([]any)
		if !ok {
			t.Fatalf("approach is %T, want a list", resolved["approach"])
		}
		// A tight variant naming one bullet must mean exactly one bullet. If
		// lists merged element-wise the résumé would silently grow instead of
		// shrinking, which is the opposite of what the variant is for.
		if len(approach) != 1 {
			t.Errorf("approach has %d entries, want 1", len(approach))
		}
	})

	t.Run("an override beats the variant it is layered on", func(t *testing.T) {
		resolved, err := sample().Resolve("tight", map[string]any{
			"objective": "One-off objective.",
		})
		if err != nil {
			t.Fatal(err)
		}
		if resolved["objective"] != "One-off objective." {
			t.Errorf("objective = %v, want the override to win", resolved["objective"])
		}
		// The override touched one field; the rest of the variant still applies.
		if approach := resolved["approach"].([]any); len(approach) != 1 {
			t.Errorf("approach has %d entries, want the variant's 1", len(approach))
		}
	})

	t.Run("resolving never mutates the stored block", func(t *testing.T) {
		source := sample()
		if _, err := source.Resolve("tight", map[string]any{"title": "Scratch"}); err != nil {
			t.Fatal(err)
		}
		// Resolution runs on every render of every résumé. If it wrote through to
		// the block, one résumé's override would leak into all the others.
		if source.Content["title"] != "Demo" {
			t.Errorf("stored title = %v, want it unchanged", source.Content["title"])
		}
		if got := source.Content["objective"]; got != "Full objective." {
			t.Errorf("stored objective = %v, want it unchanged", got)
		}
	})

	t.Run("an unknown variant is an error rather than a silent fallback", func(t *testing.T) {
		if _, err := sample().Resolve("nonexistent", nil); err == nil {
			t.Error("expected an error for an unknown variant")
		}
	})
}

func TestValidate(t *testing.T) {
	t.Run("rejects a variant named full", func(t *testing.T) {
		invalid := sample()
		invalid.Variants[VariantFull] = map[string]any{"title": "x"}
		if err := invalid.Validate(); err == nil {
			t.Error("expected an error for a variant shadowing base content")
		}
	})

	t.Run("rejects an unknown kind", func(t *testing.T) {
		invalid := sample()
		invalid.Kind = "nonsense"
		if err := invalid.Validate(); err == nil {
			t.Error("expected an error for an unknown kind")
		}
	})
}

func TestVariantNamesStartWithFull(t *testing.T) {
	names := sample().VariantNames()
	if len(names) != 2 || names[0] != VariantFull || names[1] != "tight" {
		t.Errorf("VariantNames() = %v, want [full tight]", names)
	}
}
