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
//
// Underscores are deliberately left alone. They look like they should need the
// same treatment, but hyperref resolves them correctly in every nesting this
// renderer produces — inside \entryhead, inside \textbf, and in mailto: targets
// — and escaping them is unnecessary. TestHrefPreservesUnderscore locks that in.
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

// applyEmphasis turns the inline markers into LaTeX: **bold** and *italic*.
//
// The markers are read on already-escaped text, so the content inside them is
// escaped exactly as it would be otherwise. Bold is matched before italic, so a
// bold run is never mistaken for two empty italics, and each run is re-scanned so
// *italic* nests inside **bold** and the other way round.
//
// Italic deliberately uses the asterisk and not the underscore: résumé content is
// full of identifiers like x86_64 and snake_case, and pairing those into italics
// would corrupt real text. An asterisk that is meant literally is left alone
// unless it is "tight" on both sides — no space after the opener, none before the
// closer — which keeps "5 * 3" and a trailing "*" from being read as markup.
func applyEmphasis(escaped string) string {
	var output strings.Builder
	output.Grow(len(escaped))

	for index := 0; index < len(escaped); {
		if strings.HasPrefix(escaped[index:], "**") {
			if end := strings.Index(escaped[index+2:], "**"); end > 0 {
				output.WriteString(`\textbf{`)
				output.WriteString(applyEmphasis(escaped[index+2 : index+2+end]))
				output.WriteString(`}`)
				index += end + 4
				continue
			}
			// An unmatched ** is literal text, and writing both bytes here stops
			// the italic branch below from swallowing it as an empty run.
			output.WriteString("**")
			index += 2
			continue
		}

		if escaped[index] == '*' {
			if end := tightItalic(escaped, index); end > 0 {
				output.WriteString(`\textit{`)
				output.WriteString(applyEmphasis(escaped[index+1 : index+1+end]))
				output.WriteString(`}`)
				index += end + 2
				continue
			}
		}

		output.WriteByte(escaped[index])
		index++
	}
	return output.String()
}

// tightItalic reports the length of the italic run opening at index, or 0 when
// the asterisk there does not open one.
func tightItalic(escaped string, index int) int {
	if index+1 >= len(escaped) || isSpace(escaped[index+1]) {
		return 0
	}
	for offset := index + 1; offset < len(escaped); offset++ {
		if escaped[offset] != '*' {
			continue
		}
		// A bold marker sitting inside the run is not the closer; step over both
		// of its bytes so **bold** can nest within an italic run.
		if offset+1 < len(escaped) && escaped[offset+1] == '*' {
			offset++
			continue
		}
		// A closer must hug the text it ends. An asterisk that does not qualify
		// is ordinary prose, so keep looking rather than abandoning the run.
		if offset > index+1 && !isSpace(escaped[offset-1]) {
			return offset - index - 1
		}
	}
	return 0
}

func isSpace(character byte) bool {
	return character == ' ' || character == '\t' || character == '\n' || character == '\r'
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
