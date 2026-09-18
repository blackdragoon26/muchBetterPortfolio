package render

import (
	"strings"
	"testing"
)

// The résumé is read by software before it is read by a person, and the font
// setup decides whether that software sees anything at all.
//
// Loading Latin Modern through fontspec as .otf makes XeTeX embed the text as
// CID-keyed CIDFontType0C with Identity-H encoding. Measured on this document, a
// text extractor recovered 7 alphabetic characters from the two-page PDF against
// 5067 from the Type 1 build: applicant tracking systems and Google Docs got a
// blank résumé, silently. \XeTeXgenerateactualtext did not rescue it.
//
// This test exists because the fix looks like something worth "modernising"
// back: fontspec is the current way to pick fonts, and lmodern with T1 looks
// dated next to it. Reverting it breaks nothing visible — the PDF still renders
// perfectly — so nothing else would catch it.
func TestDocumentUsesExtractableFonts(t *testing.T) {
	raw, err := templateFiles.ReadFile("templates/document.tmpl")
	if err != nil {
		t.Fatalf("read document template: %v", err)
	}
	document := string(raw)

	for _, required := range []string{`\usepackage[T1]{fontenc}`, `\usepackage{lmodern}`} {
		if !strings.Contains(document, required) {
			t.Errorf("document template is missing %s; Latin Modern must be loaded as Type 1 "+
				"so the PDF's text can be extracted by an ATS", required)
		}
	}

	// Only real directives count. The preamble explains this decision in a
	// comment, and naming the thing it warns against must not trip the test.
	active := withoutTeXComments(document)
	for _, banned := range []string{`\usepackage{fontspec}`, `\setmainfont`} {
		if strings.Contains(active, banned) {
			t.Errorf("document template uses %s, which embeds CID-keyed OpenType fonts and "+
				"makes the résumé text unextractable; load Latin Modern via lmodern instead", banned)
		}
	}
}

func withoutTeXComments(document string) string {
	var kept []string
	for _, line := range strings.Split(document, "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "%") {
			kept = append(kept, line)
		}
	}
	return strings.Join(kept, "\n")
}
