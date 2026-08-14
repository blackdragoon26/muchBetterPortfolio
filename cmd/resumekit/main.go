// Command resumekit builds résumés from the block store.
//
//	resumekit build              compile every manifest in resumes/
//	resumekit build systems      compile one manifest by id
//	resumekit list               show the block library
//	resumekit tex <id>           print the generated LaTeX without compiling
package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/blackdragoon26/muchBetterPortfolio/internal/block"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/compile"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/manifest"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/render"
)

const (
	blocksRoot  = "data/blocks"
	resumesRoot = "resumes"
	buildRoot   = ".resumekit"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	var err error
	switch os.Args[1] {
	case "build":
		err = build(os.Args[2:])
	case "list":
		err = list()
	case "tex":
		err = writeTex(os.Args[2:])
	default:
		usage()
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "resumekit: %v\n", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, "usage: resumekit build [id] | list | tex <id>\n")
	os.Exit(2)
}

func load() (*block.Store, *render.Renderer, error) {
	store, err := block.Load(blocksRoot)
	if err != nil {
		return nil, nil, fmt.Errorf("load blocks: %w", err)
	}
	renderer, err := render.New(store)
	if err != nil {
		return nil, nil, err
	}
	return store, renderer, nil
}

func selected(filter []string) ([]*manifest.Manifest, error) {
	all, err := manifest.LoadAll(resumesRoot)
	if err != nil {
		return nil, err
	}
	if len(filter) == 0 {
		return all, nil
	}
	var chosen []*manifest.Manifest
	for _, candidate := range all {
		for _, want := range filter {
			if candidate.ID == want {
				chosen = append(chosen, candidate)
			}
		}
	}
	if len(chosen) == 0 {
		return nil, fmt.Errorf("no résumé matched %s", strings.Join(filter, ", "))
	}
	return chosen, nil
}

func build(filter []string) error {
	store, renderer, err := load()
	if err != nil {
		return err
	}
	targets, err := selected(filter)
	if err != nil {
		return err
	}

	compiler := compile.New(filepath.Join(buildRoot, "work"))
	var failures int

	for _, target := range targets {
		source, err := renderer.Render(target)
		if err != nil {
			return err
		}

		result, err := compiler.Run(context.Background(), source)
		if err != nil {
			return fmt.Errorf("%s: %w", target.ID, err)
		}
		if err := os.MkdirAll(filepath.Dir(target.Output), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(target.Output, result.PDF, 0o644); err != nil {
			return err
		}

		status := "ok"
		pages := strconv.Itoa(result.Pages)
		switch {
		case !result.PagesKnown:
			// The engine printed no page summary, so the budget cannot be
			// checked. Treat that as a failure rather than reporting "0 pages".
			status = "UNKNOWN"
			pages = "?"
			failures++
		case target.MaxPages > 0 && result.Pages > target.MaxPages:
			status = "OVER"
			failures++
		}
		fmt.Printf("%-22s %s page(s)  %6.1f KB  %-7s  %s\n",
			target.ID, pages, float64(len(result.PDF))/1024, status, target.Output)

		report(store, renderer, target, result)
	}

	if failures > 0 {
		return fmt.Errorf("%d résumé(s) failed their page check", failures)
	}
	return nil
}

// report prints the fit feedback: what overflowed, and which swaps would
// actually shorten the document.
//
// Every candidate variant is rendered and measured against the one in use, and
// only the ones that come out shorter are offered. Listing all unused variants
// would be useless — half of them are longer, and the whole point of this
// report is to answer "where do I get a line back from".
func report(store *block.Store, renderer *render.Renderer, target *manifest.Manifest, result *compile.Result) {
	for _, overflow := range result.Overfull {
		fmt.Printf("    overfull %.1fpt: %s\n", overflow.Points, overflow.Detail)
	}

	overBudget := target.MaxPages > 0 && result.PagesKnown && result.Pages > target.MaxPages
	if !overBudget && len(result.Overfull) == 0 {
		return
	}

	type saving struct {
		id      string
		current string
		variant string
		chars   int
	}
	var savings []saving

	for _, section := range target.Sections {
		for _, entry := range section.Blocks {
			found, ok := store.Get(entry.Block)
			if !ok {
				continue
			}
			inUse, err := renderer.RenderBlock(found, section.Layout, entry.Variant, entry.Override)
			if err != nil {
				continue
			}
			current := entry.Variant
			if current == "" {
				current = block.VariantFull
			}

			for _, name := range found.VariantNames() {
				if name == current {
					continue
				}
				candidateVariant := name
				if name == block.VariantFull {
					candidateVariant = ""
				}
				alternative, err := renderer.RenderBlock(found, section.Layout, candidateVariant, entry.Override)
				if err != nil {
					continue
				}
				if delta := len(inUse) - len(alternative); delta > 0 {
					savings = append(savings, saving{
						id: entry.Block, current: current, variant: name, chars: delta,
					})
				}
			}
		}
	}
	if len(savings) == 0 {
		fmt.Printf("    no shorter variant exists for any block on this résumé; content needs rewriting\n")
		return
	}

	sort.Slice(savings, func(i, j int) bool { return savings[i].chars > savings[j].chars })
	fmt.Printf("    shorter variants available (by characters saved):\n")
	for _, candidate := range savings {
		fmt.Printf("      -%-5d %-42s %s -> %s\n",
			candidate.chars, candidate.id, candidate.current, candidate.variant)
	}
}

func writeTex(args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("tex needs exactly one résumé id")
	}
	_, renderer, err := load()
	if err != nil {
		return err
	}
	targets, err := selected(args)
	if err != nil {
		return err
	}
	source, err := renderer.Render(targets[0])
	if err != nil {
		return err
	}
	fmt.Print(source)
	return nil
}

func list() error {
	store, _, err := load()
	if err != nil {
		return err
	}
	for _, current := range store.All() {
		variants := current.VariantNames()
		fmt.Printf("%-52s %-14s %-28s %s\n",
			current.ID, current.Kind,
			strings.Join(variants, ","),
			strings.Join(current.Tags, " "))
	}
	fmt.Printf("\n%d blocks\n", store.Len())
	return nil
}
