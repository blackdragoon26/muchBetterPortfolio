// Command importer reconciles src/generated/portfolio.json into the block store.
//
// It replaces machine-owned facts wholesale on every run and never writes to a
// block's authored content, so the nightly sync cannot overwrite prose. New
// projects and repositories arrive as draft blocks; newly merged pull requests
// are reported rather than added, because which ones are worth showing is an
// editorial decision.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"

	"github.com/blackdragoon26/muchBetterPortfolio/internal/block"
	"github.com/blackdragoon26/muchBetterPortfolio/internal/manifest"
)

type portfolio struct {
	Projects []struct {
		ID            string   `json:"id"`
		Title         string   `json:"title"`
		Description   string   `json:"description"`
		LiveURL       string   `json:"liveUrl"`
		Repository    string   `json:"repository"`
		RepositoryURL string   `json:"repositoryUrl"`
		Technologies  []string `json:"technologies"`
		Stars         *int     `json:"stars"`
		Resume        struct {
			Include   bool     `json:"include"`
			Objective string   `json:"objective"`
			Approach  []string `json:"approach"`
			Impact    string   `json:"impact"`
		} `json:"resume"`
	} `json:"projects"`

	PullRequests []struct {
		ID           string   `json:"id"`
		Title        string   `json:"title"`
		Number       int      `json:"number"`
		Href         string   `json:"href"`
		Repository   string   `json:"repository"`
		Stars        int      `json:"stars"`
		MergedAt     string   `json:"mergedAt"`
		Additions    int      `json:"additions"`
		Deletions    int      `json:"deletions"`
		ChangedFiles int      `json:"changedFiles"`
		Technologies []string `json:"technologies"`
	} `json:"pullRequests"`
}

// technologyTags maps stack entries onto the tags presets select on. A project
// can carry several; the hardware preset leans on "hardware" and "systems",
// the AI preset on "ai".
var technologyTags = map[string][]string{
	"go":           {"backend"},
	"nomad":        {"infra"},
	"traefik":      {"infra"},
	"wireguard":    {"infra", "networking"},
	"docker":       {"infra"},
	"postgresql":   {"backend"},
	"websockets":   {"backend"},
	"fastapi":      {"backend"},
	"next.js":      {"frontend"},
	"react":        {"frontend"},
	"typescript":   {"frontend"},
	"openrouter":   {"ai"},
	"llm":          {"ai"},
	"vector db":    {"ai"},
	"openai api":   {"ai"},
	"azure openai": {"ai"},
	"mcp":          {"ai"},
	"e2b":          {"ai"},
	"p4":           {"networking", "hardware"},
	"p4runtime":    {"networking"},
	"ebpf":         {"systems", "kernel"},
	"bpftrace":     {"systems", "kernel"},
	"linux kernel": {"systems", "kernel"},
	"linux":        {"systems"},
	"c":            {"systems"},
	"c++":          {"systems"},
	"pci":          {"hardware", "systems"},
	"dma":          {"hardware", "systems"},
	"bar0 mmio":    {"hardware", "systems"},
	"napi":         {"kernel", "networking"},
	"dpdk":         {"networking", "hardware"},
	"qemu":         {"systems"},
	"raspberry pi": {"hardware", "embedded"},
	"esp32":        {"hardware", "embedded"},
	"spi":          {"hardware", "embedded"},
	"device tree":  {"hardware", "embedded"},
	"rust":         {"systems"},
	"soroban":      {"web3"},
	"sse":          {"backend"},
}

func main() {
	source := flag.String("portfolio", "src/generated/portfolio.json", "path to the generated portfolio JSON")
	root := flag.String("blocks", "data/blocks", "block store root")
	resumesRoot := flag.String("resumes", "resumes", "résumé manifest directory")
	flag.Parse()

	raw, err := os.ReadFile(*source)
	if err != nil {
		log.Fatalf("read portfolio: %v", err)
	}
	var data portfolio
	if err := json.Unmarshal(raw, &data); err != nil {
		log.Fatalf("parse portfolio: %v", err)
	}

	if err := os.MkdirAll(*root, 0o755); err != nil {
		log.Fatalf("create block root: %v", err)
	}
	store, err := block.Load(*root)
	if err != nil {
		log.Fatalf("load blocks: %v", err)
	}

	var created, refreshed int
	for _, project := range data.Projects {
		id := "project:" + project.ID
		machine := map[string]any{
			"repository":    project.Repository,
			"repositoryUrl": project.RepositoryURL,
			"liveUrl":       project.LiveURL,
			"technologies":  project.Technologies,
			"description":   project.Description,
		}
		if project.Stars != nil {
			machine["stars"] = *project.Stars
		}

		if existing, found := store.Get(id); found {
			// A manual block is documented as never imported, so honour that
			// rather than injecting machine data into something hand-authored
			// that happens to share an id.
			if existing.Source == block.SourceManual {
				fmt.Printf("skipping %s: source is manual\n", id)
				continue
			}
			// Refresh machine facts only. This is the invariant the whole design
			// rests on: a sync must never be able to rewrite authored prose.
			existing.Machine = machine
			if err := store.Save(existing); err != nil {
				log.Fatalf("refresh %s: %v", id, err)
			}
			refreshed++
			continue
		}

		created++
		stack := strings.Join(project.Technologies, ", ")
		if err := store.Save(&block.Block{
			ID:      id,
			Kind:    block.KindProject,
			Source:  block.SourceReadme,
			Tags:    tagsFor(project.Technologies),
			Machine: machine,
			Content: map[string]any{
				"title":     project.Title,
				"stack":     stack,
				"link":      firstNonEmpty(project.LiveURL, project.RepositoryURL),
				"objective": project.Resume.Objective,
				"approach":  toAnySlice(project.Resume.Approach),
				"impact":    project.Resume.Impact,
			},
		}); err != nil {
			log.Fatalf("write %s: %v", id, err)
		}
	}

	// Pull requests group by repository, matching how they already render.
	type group struct {
		repository string
		stars      int
		entries    []map[string]any
		machine    []map[string]any
		tags       map[string]bool
	}
	groups := map[string]*group{}
	var order []string
	for _, request := range data.PullRequests {
		existing, found := groups[request.Repository]
		if !found {
			existing = &group{repository: request.Repository, stars: request.Stars, tags: map[string]bool{}}
			groups[request.Repository] = existing
			order = append(order, request.Repository)
		}
		// The raw PR title is a machine fact. The human-facing rewrite lives in
		// content.summary, which starts empty and is authored later; the
		// template falls back to this title until then.
		existing.machine = append(existing.machine, map[string]any{
			"number":       request.Number,
			"title":        request.Title,
			"href":         request.Href,
			"mergedAt":     request.MergedAt,
			"additions":    request.Additions,
			"deletions":    request.Deletions,
			"changedFiles": request.ChangedFiles,
		})
		existing.entries = append(existing.entries, map[string]any{
			"number":  request.Number,
			"summary": "",
		})
		for _, tag := range tagsFor(request.Technologies) {
			existing.tags[tag] = true
		}
	}

	for _, repository := range order {
		found := groups[repository]
		id := "contribution:" + strings.ToLower(strings.ReplaceAll(repository, "/", "-"))
		machine := map[string]any{
			"repository":   repository,
			"stars":        found.stars,
			"pullRequests": toAnyMaps(found.machine),
		}

		if existing, present := store.Get(id); present {
			if existing.Source == block.SourceManual {
				fmt.Printf("skipping %s: source is manual\n", id)
				continue
			}
			existing.Machine = machine
			if err := store.Save(existing); err != nil {
				log.Fatalf("refresh %s: %v", id, err)
			}
			refreshed++
			continue
		}

		created++
		var tags []string
		for tag := range found.tags {
			tags = append(tags, tag)
		}
		sort.Strings(tags)
		if err := store.Save(&block.Block{
			ID:      id,
			Kind:    block.KindContribution,
			Source:  block.SourceGitHub,
			Tags:    append(tags, "opensource"),
			Machine: machine,
			Content: map[string]any{
				"label":   repository,
				"entries": toAnyMaps(found.entries),
			},
		}); err != nil {
			log.Fatalf("write %s: %v", id, err)
		}
	}

	fmt.Printf("imported: %d new block(s), %d refreshed (store holds %d)\n",
		created, refreshed, store.Len())

	reportUnreferenced(store, *resumesRoot)
}

// reportUnreferenced surfaces work that arrived from GitHub but is not yet on
// any résumé.
//
// The importer deliberately does not auto-add newly merged pull requests to a
// contribution block's rendered list: which PRs are worth showing is an editorial
// call, and a nightly job silently lengthening every résumé would be worse than
// useless. But staying silent about them is just as bad, because a genuinely
// good PR would sit unnoticed in the machine map forever. So they are reported.
func reportUnreferenced(store *block.Store, resumesDir string) {
	// A résumé can pull a pull request in through a manifest override, which
	// lives outside the block file entirely. Those count as referenced too, or
	// the report nags about PRs that are already on a résumé.
	overrides := map[string][]any{}
	if manifests, err := manifest.LoadAll(resumesDir); err == nil {
		for _, target := range manifests {
			for _, section := range target.Sections {
				for _, entry := range section.Blocks {
					listed, ok := entry.Override["entries"].([]any)
					if ok {
						overrides[entry.Block] = append(overrides[entry.Block], listed...)
					}
				}
			}
		}
	} else {
		fmt.Fprintf(os.Stderr, "warning: could not read %s, override entries ignored: %v\n",
			resumesDir, err)
	}

	var pending []string
	for _, current := range store.ByKind(block.KindContribution) {
		referenced := map[int]bool{}
		collectList := func(items []any) {
			for _, item := range items {
				if entry, ok := item.(map[string]any); ok {
					referenced[asInt(entry["number"])] = true
				}
			}
		}
		// A PR counts as referenced if any variant lists it, not just base
		// content — a PR shown only on the hardware résumé is still in use.
		collect := func(content map[string]any) {
			entries, _ := content["entries"].([]any)
			collectList(entries)
		}
		collect(current.Content)
		for _, variant := range current.Variants {
			collect(variant)
		}
		collectList(overrides[current.ID])

		imported, _ := current.Machine["pullRequests"].([]any)
		for _, item := range imported {
			fact, ok := item.(map[string]any)
			if !ok {
				continue
			}
			number := asInt(fact["number"])
			if referenced[number] {
				continue
			}
			pending = append(pending, fmt.Sprintf("  %s #%d  %s",
				current.ID, number, fmt.Sprint(fact["title"])))
		}
	}

	if len(pending) == 0 {
		return
	}
	sort.Strings(pending)
	fmt.Printf("\n%d merged pull request(s) are imported but not shown on any résumé:\n", len(pending))
	for _, line := range pending {
		fmt.Println(line)
	}
	fmt.Printf("add one by listing its number under content.entries in the block file.\n")
}

func asInt(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	}
	return 0
}

func tagsFor(technologies []string) []string {
	unique := map[string]bool{}
	for _, technology := range technologies {
		for _, tag := range technologyTags[strings.ToLower(strings.TrimSpace(technology))] {
			unique[tag] = true
		}
	}
	var tags []string
	for tag := range unique {
		tags = append(tags, tag)
	}
	sort.Strings(tags)
	return tags
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func toAnySlice(values []string) []any {
	converted := make([]any, len(values))
	for index, value := range values {
		converted[index] = value
	}
	return converted
}

func toAnyMaps(values []map[string]any) []any {
	converted := make([]any, len(values))
	for index, value := range values {
		converted[index] = value
	}
	return converted
}
