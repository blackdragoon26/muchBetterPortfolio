package render

import (
	"embed"
	"fmt"
	"strings"
	"text/template"

	"github.com/blackdragoon26/muchBetterPortfolio/internal/block"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/manifest"
)

//go:embed templates/*.tmpl
var templateFiles embed.FS

// Templates use << >> rather than {{ }} because LaTeX source is dense with
// braces and the two syntaxes are otherwise impossible to read together.
const (
	delimLeft  = "<<"
	delimRight = ">>"
)

// Renderer turns a manifest plus the block store into a LaTeX document.
type Renderer struct {
	store     *block.Store
	templates *template.Template
}

// New builds a Renderer over a loaded block store.
func New(store *block.Store) (*Renderer, error) {
	parsed, err := template.New("resume").
		Delims(delimLeft, delimRight).
		Funcs(templateFuncs()).
		ParseFS(templateFiles, "templates/*.tmpl")
	if err != nil {
		return nil, fmt.Errorf("parse templates: %w", err)
	}
	return &Renderer{store: store, templates: parsed}, nil
}

// sectionView is what a section template receives.
type sectionView struct {
	Heading string
	Layout  manifest.Layout
	Blocks  []blockView
}

// blockView pairs a block's resolved content with the metadata a template needs
// to decide how to draw it.
type blockView struct {
	ID      string
	Kind    block.Kind
	Layout  manifest.Layout
	Variant string
	Content map[string]any
}

// Render produces the complete .tex source for a manifest.
func (r *Renderer) Render(target *manifest.Manifest) (string, error) {
	var body strings.Builder

	for _, section := range target.Sections {
		view := sectionView{
			Heading: section.Heading,
			Layout:  section.Layout,
		}
		if view.Layout == "" {
			view.Layout = manifest.LayoutPlain
		}

		for _, entry := range section.Blocks {
			found, ok := r.store.Get(entry.Block)
			if !ok {
				return "", fmt.Errorf("résumé %s: block %s is not in the store", target.ID, entry.Block)
			}
			resolved, err := found.Resolve(entry.Variant, entry.Override)
			if err != nil {
				return "", fmt.Errorf("résumé %s: %w", target.ID, err)
			}
			view.Blocks = append(view.Blocks, blockView{
				ID:      found.ID,
				Kind:    found.Kind,
				Layout:  view.Layout,
				Variant: entry.Variant,
				Content: resolved,
			})
		}

		rendered, err := r.renderSection(view)
		if err != nil {
			return "", fmt.Errorf("résumé %s, section %q: %w", target.ID, section.Heading, err)
		}
		body.WriteString(rendered)
	}

	var document strings.Builder
	if err := r.templates.ExecuteTemplate(&document, "document.tmpl", map[string]any{
		"Body": body.String(),
	}); err != nil {
		return "", fmt.Errorf("render document: %w", err)
	}
	return document.String(), nil
}

// RenderBlock renders a single block in isolation. It exists so callers can
// measure what a variant costs in output length without compiling the whole
// document, which is what turns "these variants exist" into "these variants are
// shorter than what you have".
func (r *Renderer) RenderBlock(source *block.Block, layout manifest.Layout, variant string, override map[string]any) (string, error) {
	resolved, err := source.Resolve(variant, override)
	if err != nil {
		return "", err
	}
	if layout == "" {
		layout = manifest.LayoutPlain
	}
	var rendered strings.Builder
	name := string(source.Kind) + ".tmpl"
	if source.Kind == block.KindHeader {
		name = "header.tmpl"
	}
	if err := r.templates.ExecuteTemplate(&rendered, name, blockView{
		ID:      source.ID,
		Kind:    source.Kind,
		Layout:  layout,
		Variant: variant,
		Content: resolved,
	}); err != nil {
		return "", err
	}
	return rendered.String(), nil
}

func (r *Renderer) renderSection(view sectionView) (string, error) {
	var rendered strings.Builder

	// The header block is the document's masthead and never sits under a heading.
	if len(view.Blocks) > 0 && view.Blocks[0].Kind == block.KindHeader {
		if err := r.templates.ExecuteTemplate(&rendered, "header.tmpl", view.Blocks[0]); err != nil {
			return "", err
		}
		return rendered.String(), nil
	}

	if view.Heading != "" {
		fmt.Fprintf(&rendered, "\\sectionhead{%s}%%\n", Latex(view.Heading))
	}

	type piece struct {
		body string
		row  bool
	}
	var pieces []piece
	for _, current := range view.Blocks {
		var single strings.Builder
		name := string(current.Kind) + ".tmpl"
		if err := r.templates.ExecuteTemplate(&single, name, current); err != nil {
			return "", fmt.Errorf("block %s: %w", current.ID, err)
		}
		pieces = append(pieces, piece{
			body: strings.TrimRight(single.String(), "\n"),
			row:  rowShaped(current.Kind),
		})
	}

	if view.Layout != manifest.LayoutBoxed {
		var bodies []string
		for _, current := range pieces {
			bodies = append(bodies, current.body)
		}
		rendered.WriteString(strings.Join(bodies, "\n"))
		rendered.WriteString("\n")
		return rendered.String(), nil
	}

	// A boxed section draws a bordered table, but only some blocks are shaped
	// like table rows. A project emits its own minipage and tabular, and
	// dropping that inside a cell produces a \par where LaTeX will not accept
	// one — which surfaces as "Incomplete \ifx" from \entryhead rather than as
	// anything that names the real problem.
	//
	// So consecutive row-shaped blocks are grouped into one table and anything
	// else is emitted between tables, in the order it was placed. A block landing
	// in the wrong section then looks wrong rather than failing to compile.
	const openTable = "\\noindent\\begin{tabular}{|p{\\dimexpr\\linewidth-2\\tabcolsep-2\\arrayrulewidth\\relax}|}\n\\hline\n"
	const closeTable = "\\\\\n\\hline\n\\end{tabular}%\n"

	var run []string
	flush := func() {
		if len(run) == 0 {
			return
		}
		rendered.WriteString(openTable)
		rendered.WriteString(strings.Join(run, "\\\\[2.5pt]\n"))
		rendered.WriteString(closeTable)
		run = nil
	}

	for _, current := range pieces {
		if current.row {
			run = append(run, current.body)
			continue
		}
		flush()
		rendered.WriteString(current.body)
		rendered.WriteString("\n")
	}
	flush()
	return rendered.String(), nil
}

// rowShaped reports whether a block renders as a single table row, and so may
// sit inside a boxed section's tabular. Everything else brings its own block
// structure and has to live outside one.
func rowShaped(kind block.Kind) bool {
	switch kind {
	case block.KindContribution, block.KindSpacer:
		return true
	default:
		return false
	}
}
