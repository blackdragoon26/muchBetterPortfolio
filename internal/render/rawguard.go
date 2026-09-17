package render

import (
	"fmt"
	"regexp"
	"strings"
)

// This file guards hand-written LaTeX. resumekit lets a résumé be authored as
// raw LaTeX instead of generated from blocks, which is a new trust boundary:
// the builder compiles the document as the same user that holds the deploy
// secrets, and tectonic — even with --untrusted and openin_any=p — will happily
// \input an absolute path and embed a file the résumé should never see (proven
// against /etc/hosts and /run/secrets during development).
//
// This is a best-effort SOURCE guard, not a sandbox. tectonic already refuses
// shell-escape (\write18 does not execute), so the remaining realistic leak is a
// file-reading primitive aimed at an absolute or parent-directory path. We
// reject exactly those. A relative include is allowed and simply finds nothing,
// because each compile runs in its own scratch directory containing only the
// résumé itself. A determined author can still defeat a regex with catcode
// tricks, but the person submitting LaTeX here is the authenticated site owner,
// so the guard is a guardrail against an accidental paste, not a security
// perimeter against a hostile author.

// texInputCommands are the primitives that read a file named by their first
// braced argument. Each is matched with an optional bracket option in between,
// e.g. \includegraphics[width=1cm]{/abs/path}.
var texInputCommands = []string{
	"input", "include", "subfile", "subfileinclude", "subimport", "import",
	"InputIfFileExists", "IfFileExists", "lstinputlisting", "verbatiminput",
	"VerbatimInput", "catchfile", "includegraphics", "includestandalone",
	"includepdf", "pdfximage", "graphicspath",
}

var (
	// One compiled matcher per input command, built once at package load.
	texInputMatchers = buildInputMatchers()

	// \openin<stream>=<path> and \read forms name their target after an equals
	// sign or as a bare token rather than in braces.
	openInMatcher = regexp.MustCompile(`\\open(?:in|out)\b[^=\n]*=\s*([^\s{}\\]+|\{[^}]*\})`)

	// Shell escape. tectonic disables execution, but a document that reaches for
	// it is doing something a résumé never needs, so we refuse it outright rather
	// than rely on the engine's default staying off.
	shellEscapeMatcher = regexp.MustCompile(`\\(?:write\s*18|immediate\s*\\write\s*18|ShellEscape|directlua|write18)\b`)
)

func buildInputMatchers() map[string]*regexp.Regexp {
	matchers := make(map[string]*regexp.Regexp, len(texInputCommands))
	for _, command := range texInputCommands {
		// \<command> , optional [..] option group, then the first {..} argument.
		matchers[command] = regexp.MustCompile(
			`\\` + command + `\b\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}`)
	}
	return matchers
}

// GuardRawTex refuses hand-written LaTeX that would read a file outside the
// compile's scratch directory, or that reaches for shell escape. It returns nil
// for source that only reads relative paths or no files at all.
func GuardRawTex(source string) error {
	clean := stripTeXComments(source)

	if loc := shellEscapeMatcher.FindString(clean); loc != "" {
		return fmt.Errorf("raw LaTeX: shell escape (%s) is not allowed", strings.TrimSpace(loc))
	}

	for command, matcher := range texInputMatchers {
		for _, match := range matcher.FindAllStringSubmatch(clean, -1) {
			for _, candidate := range splitTeXPaths(match[1]) {
				if unsafeTeXPath(candidate) {
					return fmt.Errorf(
						"raw LaTeX: \\%s of %q is not allowed — absolute paths, parent-directory (..) paths and pipes are blocked",
						command, strings.TrimSpace(candidate))
				}
			}
		}
	}

	for _, match := range openInMatcher.FindAllStringSubmatch(clean, -1) {
		target := strings.Trim(match[1], "{}")
		if unsafeTeXPath(target) {
			return fmt.Errorf(
				"raw LaTeX: reading %q via \\openin/\\openout is not allowed — absolute paths, parent-directory (..) paths and pipes are blocked",
				strings.TrimSpace(target))
		}
	}
	return nil
}

// splitTeXPaths handles the few commands whose argument is a comma-separated
// list (\graphicspath takes {{dir1}{dir2}}, \includepdf pages lists, etc). For
// the common single-path case this returns one element.
func splitTeXPaths(argument string) []string {
	argument = strings.ReplaceAll(argument, "}{", ",")
	argument = strings.NewReplacer("{", "", "}", "").Replace(argument)
	fields := strings.Split(argument, ",")
	paths := make([]string, 0, len(fields))
	for _, field := range fields {
		if trimmed := strings.TrimSpace(field); trimmed != "" {
			paths = append(paths, trimmed)
		}
	}
	if len(paths) == 0 {
		return []string{argument}
	}
	return paths
}

// unsafeTeXPath reports whether a file argument escapes the scratch directory.
func unsafeTeXPath(candidate string) bool {
	trimmed := strings.TrimSpace(candidate)
	if trimmed == "" {
		return false
	}
	switch {
	case strings.HasPrefix(trimmed, "/"): // absolute
		return true
	case strings.HasPrefix(trimmed, "~"): // home-relative
		return true
	case strings.HasPrefix(trimmed, "|"): // \input{|command} pipe
		return true
	case strings.HasPrefix(trimmed, "`"): // backtick command substitution
		return true
	case trimmed == "..", strings.HasPrefix(trimmed, "../"), strings.Contains(trimmed, "/../"), strings.HasSuffix(trimmed, "/.."):
		return true
	}
	return false
}

// stripTeXComments removes everything from an unescaped % to the end of its
// line, so a path that only appears inside a comment does not trip the guard and
// a comment cannot hide one from it either.
func stripTeXComments(source string) string {
	var out strings.Builder
	out.Grow(len(source))
	for _, line := range strings.Split(source, "\n") {
		cut := -1
		for i := 0; i < len(line); i++ {
			if line[i] != '%' {
				continue
			}
			// A percent preceded by an odd number of backslashes is escaped.
			backslashes := 0
			for j := i - 1; j >= 0 && line[j] == '\\'; j-- {
				backslashes++
			}
			if backslashes%2 == 0 {
				cut = i
				break
			}
		}
		if cut >= 0 {
			out.WriteString(line[:cut])
		} else {
			out.WriteString(line)
		}
		out.WriteByte('\n')
	}
	return out.String()
}
