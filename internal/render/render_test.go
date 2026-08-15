package render

import (
	"strings"
	"testing"

	"github.com/blackdragoon26/muchBetterPortfolio/internal/block"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/manifest"
)

func testStore(t *testing.T) *block.Store {
	t.Helper()
	store, err := block.Load("../../data/blocks")
	if err != nil {
		t.Fatalf("load blocks: %v", err)
	}
	return store
}

func render(t *testing.T, target *manifest.Manifest) string {
	t.Helper()
	renderer, err := New(testStore(t))
	if err != nil {
		t.Fatal(err)
	}
	out, err := renderer.Render(target)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	return out
}

// A project dropped into a boxed section used to emit its minipage inside the
// section's tabular, putting a \par where LaTeX will not take one. That failed
// to compile with "Incomplete \ifx" from \entryhead — an error naming neither
// the block nor the section that caused it.
func TestBoxedSectionKeepsNonRowBlocksOutsideTheTable(t *testing.T) {
	out := render(t, &manifest.Manifest{
		ID: "t", Output: "public/resume/t.pdf",
		Sections: []manifest.Section{{
			Heading: "Open Source Contributions",
			Layout:  manifest.LayoutBoxed,
			Blocks: []manifest.Entry{
				{Block: "contribution:facebook-bpfilter"},
				{Block: "project:slix"},
				{Block: "contribution:p4lang-tutorials"},
			},
		}},
	})

	// The project's own minipage must not be nested inside a table.
	minipage := strings.Index(out, "\\begin{minipage}")
	if minipage < 0 {
		t.Fatal("the project block did not render")
	}
	before := out[:minipage]
	opens := strings.Count(before, "\\begin{tabular}")
	closes := strings.Count(before, "\\end{tabular}")
	if opens != closes {
		t.Errorf("project starts inside an open tabular (%d opened, %d closed before it)", opens, closes)
	}

	// Both contribution runs still get a bordered table of their own.
	if got := strings.Count(out, "\\begin{tabular}"); got < 3 {
		t.Errorf("expected a table for each contribution run plus the project's own, got %d", got)
	}
	if strings.Count(out, "\\begin{tabular}") != strings.Count(out, "\\end{tabular}") {
		t.Error("tabular environments are unbalanced")
	}
}

func TestSpacerRendersBetweenBlocks(t *testing.T) {
	out := render(t, &manifest.Manifest{
		ID: "t", Output: "public/resume/t.pdf",
		Sections: []manifest.Section{{
			Heading: "Key Projects",
			Blocks: []manifest.Entry{
				{Block: "project:slix"},
				{Block: "spacer:large"},
				{Block: "project:cutable"},
			},
		}},
	})
	gap := strings.Index(out, "\\vspace*{14pt}")
	if gap < 0 {
		t.Fatal("the spacer did not render")
	}
	// It has to sit between the two projects, not before or after both.
	first, second := strings.Index(out, "Slix"), strings.Index(out, "Cutable")
	if !(first < gap && gap < second) {
		t.Errorf("spacer at %d is not between the projects at %d and %d", gap, first, second)
	}
}
