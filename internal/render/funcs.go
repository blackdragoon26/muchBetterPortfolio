package render

import (
	"fmt"
	"strings"
	"text/template"
)

// templateFuncs exposes the escaping helpers plus a handful of map accessors.
// Block content is map[string]any so that variants and overrides can merge
// generically, which means templates need forgiving lookups rather than struct
// field access — a missing optional key must render as empty, not "<no value>".
func templateFuncs() template.FuncMap {
	return template.FuncMap{
		// Escaping.
		"tex":  Latex,
		"texn": LatexBoldNumbers,
		"mk":   Markup,
		"mkn":  MarkupNumbers,
		"href": Href,

		// Lookups.
		"str":   str,
		"has":   has,
		"rows":  rows,
		"strAt": strAt,
		"prs":   pullRequests,

		// Prose assembly.
		"joinClauses": joinClauses,
		"trimEnd":     func(value string) string { return strings.TrimRight(value, ".!?") },
	}
}

// str reads a string field, returning "" when absent or of another type.
func str(content map[string]any, key string) string {
	value, present := content[key]
	if !present || value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

// has reports whether a key holds something worth rendering. Empty strings and
// empty lists count as absent, which is what lets a variant switch a field off
// by setting it to "" rather than needing a separate flag.
func has(content map[string]any, key string) bool {
	value, present := content[key]
	if !present || value == nil {
		return false
	}
	switch typed := value.(type) {
	case string:
		return typed != ""
	case []any:
		return len(typed) > 0
	case map[string]any:
		return len(typed) > 0
	}
	return true
}

// rows reads a list field as a slice of maps, for tabular block kinds.
func rows(content map[string]any, key string) []map[string]any {
	value, present := content[key]
	if !present {
		return nil
	}
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	var converted []map[string]any
	for _, item := range items {
		if entry, ok := item.(map[string]any); ok {
			converted = append(converted, entry)
			continue
		}
		// A bare string in a list position is treated as a single-field row so
		// that simple bullet lists and structured rows can share one template.
		converted = append(converted, map[string]any{"text": fmt.Sprint(item)})
	}
	return converted
}

// strAt reads a string out of a list-of-strings field.
func strAt(content map[string]any, key string) []string {
	value, present := content[key]
	if !present {
		return nil
	}
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	var converted []string
	for _, item := range items {
		converted = append(converted, fmt.Sprint(item))
	}
	return converted
}

// PullRequest is a contribution entry with its machine-supplied link resolved.
type PullRequest struct {
	Number  int
	Href    string
	Summary string
}

// pullRequests joins the human-selected entries against the machine-imported
// pull request facts.
//
// The two live under different keys on purpose. Merging replaces slices
// wholesale, so if authored entries and imported facts shared a key the authored
// list would shadow the imported one and every PR link would vanish. Keeping
// them apart also gives the content list a second job: it is the selection and
// the ordering, so dropping a PR from a résumé means deleting one line here
// rather than maintaining an exclusion list in code.
func pullRequests(content map[string]any) []PullRequest {
	imported := map[int]map[string]any{}
	for _, entry := range rows(content, "pullRequests") {
		imported[intOf(entry["number"])] = entry
	}

	var joined []PullRequest
	for _, entry := range rows(content, "entries") {
		number := intOf(entry["number"])
		resolved := PullRequest{Number: number, Summary: str(entry, "summary")}
		if fact, found := imported[number]; found {
			resolved.Href = str(fact, "href")
			// Until someone writes a human summary, the raw commit subject is
			// the best available text.
			if resolved.Summary == "" {
				resolved.Summary = str(fact, "title")
			}
		}
		joined = append(joined, resolved)
	}
	return joined
}

func intOf(value any) int {
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

// joinClauses stitches approach bullets into one sentence, lower-casing every
// clause after the first. This reproduces the phrasing rule already used by
// scripts/generate-resume-highlights.mjs so the boxed project layout reads as
// prose rather than as a list that lost its bullets.
func joinClauses(clauses []string) string {
	var assembled []string
	for index, clause := range clauses {
		trimmed := strings.TrimRight(clause, ".!?")
		if trimmed == "" {
			continue
		}
		if index > 0 {
			trimmed = strings.ToLower(trimmed[:1]) + trimmed[1:]
		}
		assembled = append(assembled, trimmed)
	}
	return strings.Join(assembled, "; ")
}
