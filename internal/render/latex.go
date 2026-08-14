package render

import (
	"strings"
)

// This file ports the escaping rules from scripts/generate-resume-highlights.mjs,
// which are the battle-tested spec for turning portfolio prose into LaTeX.
//
// One deliberate divergence: the original chains regex replacements, so a
// backslash in the source first becomes \textbackslash{} and then has its own
// braces escaped by the next rule, emitting \textbackslash\{\}. Escaping here is
// a single pass over the input so a literal backslash survives correctly. No
// current content contains one, which is why the original never showed the bug.

var latexReplacements = map[rune]string{
	'\\': `\textbackslash{}`,
	'#':  `\#`,
	'$':  `\$`,
	'%':  `\%`,
	'&':  `\&`,
	'_':  `\_`,
	'{':  `\{`,
	'}':  `\}`,
	'~':  `\textasciitilde{}`,
	'^':  `\textasciicircum{}`,
}

// normalizations fold typographic characters that the Latin Modern font either
// renders inconsistently or cannot represent, applied before escaping.
var normalizations = strings.NewReplacer(
	"…", "...",
	"–", "-",
	"—", "-",
	"‘", "'",
	"’", "'",
	"“", `"`,
	"”", `"`,
)

// Latex escapes a plain string for inclusion in a LaTeX document.
func Latex(value string) string {
	normalized := normalizations.Replace(value)

	var escaped strings.Builder
	escaped.Grow(len(normalized))
	for _, symbol := range normalized {
		if replacement, special := latexReplacements[symbol]; special {
			escaped.WriteString(replacement)
			continue
		}
		escaped.WriteRune(symbol)
	}
	return escaped.String()
}

// Href prepares a URL for use as the first argument of \href.
//
// hyperref copes with % and # when \href is written directly in the document,
// but this renderer nests links inside \entryhead and \textbf, and an outer
// macro scans its argument first. A percent sign then comments out the rest of
// the generated line, and a hash raises an illegal-parameter error. Since
// percent-encoding makes % common in real URLs, both are escaped here.
// Backslashes and braces are dropped outright: neither is valid in a URL, and
// either could start a control sequence or close the argument group.
func Href(value string) string {
	var cleaned strings.Builder
	cleaned.Grow(len(value))
	for _, symbol := range value {
		switch symbol {
		case '{', '}', '\\':
			// Dropped, not escaped: these cannot appear in a well-formed URL.
		case '%':
			cleaned.WriteString(`\%`)
		case '#':
			cleaned.WriteString(`\#`)
		default:
			cleaned.WriteRune(symbol)
		}
	}
	return cleaned.String()
}

// Markup escapes a string and then honours a deliberately tiny inline syntax:
// **bold** becomes \textbf{bold}.
//
// Block content is plain text so that the builder UI can edit it safely, but a
// few fields genuinely need emphasis inside a sentence — the author's own name
// in a citation, for instance. Asterisks are not LaTeX specials, so they survive
// escaping untouched and can be translated afterwards without any risk of
// interpreting user text as commands.
func Markup(value string) string {
	return applyEmphasis(Latex(value))
}

// MarkupNumbers applies both the inline emphasis syntax and automatic metric
// bolding, for prose fields that want each.
func MarkupNumbers(value string) string {
	return applyEmphasis(LatexBoldNumbers(value))
}

func applyEmphasis(escaped string) string {
	var output strings.Builder
	output.Grow(len(escaped))

	remaining := escaped
	for {
		open := strings.Index(remaining, "**")
		if open < 0 {
			break
		}
		close := strings.Index(remaining[open+2:], "**")
		if close < 0 {
			break
		}
		output.WriteString(remaining[:open])
		output.WriteString(`\textbf{`)
		output.WriteString(remaining[open+2 : open+2+close])
		output.WriteString(`}`)
		remaining = remaining[open+2+close+2:]
	}
	output.WriteString(remaining)
	return output.String()
}

// LatexBoldNumbers escapes a string and wraps every standalone number in
// \textbf, which is the house style for metrics across the résumé.
//
// "Standalone" means the number is not glued to letters on either side, so
// "646,400 packets" and "30%" bold but "XNIC v1" and "82540EM" do not. The
// original expressed this with JavaScript lookaround; Go's RE2 engine has none,
// so the scan is explicit here.
func LatexBoldNumbers(value string) string {
	normalized := normalizations.Replace(value)
	runes := []rune(normalized)

	var output strings.Builder
	for index := 0; index < len(runes); {
		if !isDigit(runes[index]) || (index > 0 && isAlphanumeric(runes[index-1])) {
			output.WriteString(Latex(string(runes[index])))
			index++
			continue
		}

		if end, matched := matchNumber(runes, index); matched {
			output.WriteString(`\textbf{`)
			output.WriteString(Latex(string(runes[index:end])))
			output.WriteString(`}`)
			index = end
			continue
		}

		// No valid match starts here. Every later position inside this digit run
		// is preceded by an alphanumeric, so skip the whole run at once.
		for index < len(runes) && isAlphanumeric(runes[index]) {
			output.WriteString(Latex(string(runes[index])))
			index++
		}
	}
	return output.String()
}

// matchNumber implements \d[\d,.]*(?:\+|%|x)?(?![A-Za-z0-9]) anchored at start,
// shrinking the greedy body until the trailing boundary check passes.
func matchNumber(runes []rune, start int) (int, bool) {
	body := start + 1
	for body < len(runes) && (isDigit(runes[body]) || runes[body] == ',' || runes[body] == '.') {
		body++
	}

	for end := body; end > start; end-- {
		candidate := end

		// The optional +, % or x suffix is part of the number when present.
		if candidate < len(runes) && isNumberSuffix(runes[candidate]) {
			candidate++
		}
		if candidate < len(runes) && isAlphanumeric(runes[candidate]) {
			continue
		}
		// A trailing separator belongs to the sentence, not the number.
		if runes[end-1] == ',' || runes[end-1] == '.' {
			continue
		}
		return candidate, true
	}
	return start, false
}

func isDigit(symbol rune) bool { return symbol >= '0' && symbol <= '9' }

func isNumberSuffix(symbol rune) bool {
	return symbol == '+' || symbol == '%' || symbol == 'x'
}

// isAlphanumeric reports whether a rune glues a number to a surrounding word.
// Underscore counts, unlike in the original JavaScript, because identifiers like
// x86_64, net_pcap and rte_ethdev run through this path and their digits must
// never be bolded.
func isAlphanumeric(symbol rune) bool {
	return isDigit(symbol) ||
		symbol == '_' ||
		(symbol >= 'a' && symbol <= 'z') ||
		(symbol >= 'A' && symbol <= 'Z')
}
