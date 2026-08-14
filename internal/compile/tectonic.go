// Package compile drives tectonic and reports back the two facts that decide
// whether a résumé is finished: how many pages it came out at, and which lines
// overflowed their measure.
//
// tectonic is used rather than a TeX Live installation because it is a single
// binary that fetches only the packages a document actually needs, so a fresh
// machine can build the résumé without installing a distribution. The document's
// fontspec preamble requires a Unicode engine, which tectonic provides via XeTeX.
package compile

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// Result describes one compilation.
type Result struct {
	PDF   []byte
	Pages int

	// PagesKnown is false when the engine printed no page summary. Callers must
	// not treat Pages as 0 in that case: a page budget would silently pass.
	PagesKnown bool

	Overfull []Overflow
	Log      string
}

// Overflow is a single overfull box: a line that did not fit its column.
// Points are the amount by which it overran, which is the number that tells you
// whether a line needs rewriting or merely nudging.
type Overflow struct {
	Points float64
	Line   int
	Detail string
}

// Compiler runs tectonic against a scratch directory.
type Compiler struct {
	// Binary is the tectonic executable; defaults to "tectonic" on PATH.
	Binary string
	// WorkDir holds the .tex and intermediate files. Reusing one directory
	// across compiles keeps tectonic's caches warm, which is the difference
	// between a ~3s rebuild and a fresh multi-minute asset download.
	WorkDir string
}

// New returns a Compiler writing into dir.
func New(dir string) *Compiler {
	return &Compiler{Binary: "tectonic", WorkDir: dir}
}

// Engine reports the typesetting engine in use. Exported LaTeX is only
// reproducible if the reader knows what compiled it: the preamble needs a
// Unicode engine for fontspec, so plain pdflatex will not build this document.
func (c *Compiler) Engine() string {
	binary := c.Binary
	if binary == "" {
		binary = "tectonic"
	}
	out, err := exec.Command(binary, "--version").Output()
	version := strings.TrimSpace(string(out))
	if err != nil || version == "" {
		version = "tectonic (version unknown)"
	}
	return version + " — XeTeX backend, compiled with: tectonic -X compile resume.tex"
}

var (
	pagesPattern    = regexp.MustCompile(`\((\d+) pages?,`)
	overfullPattern = regexp.MustCompile(`Overfull \\[hv]box \(([\d.]+)pt too wide\)`)
	lineHintPattern = regexp.MustCompile(`(?:at lines? |lines? )(\d+)`)
)

// Run compiles the given LaTeX source and returns the PDF plus its fit report.
//
// Each run gets its own subdirectory. Concurrent callers would otherwise write
// the same resume.tex and read the same resume.pdf, and could be handed a
// document built from someone else's source. The tectonic support-file cache
// lives outside this directory (under XDG_CACHE_HOME), so per-run isolation
// costs nothing in compile time.
func (c *Compiler) Run(ctx context.Context, source string) (*Result, error) {
	if err := os.MkdirAll(c.WorkDir, 0o755); err != nil {
		return nil, err
	}
	runDir, err := os.MkdirTemp(c.WorkDir, "run-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(runDir)

	texPath := filepath.Join(runDir, "resume.tex")
	if err := os.WriteFile(texPath, []byte(source), 0o644); err != nil {
		return nil, err
	}

	binary := c.Binary
	if binary == "" {
		binary = "tectonic"
	}

	// --print surfaces the engine's own page-count line; --keep-logs leaves the
	// .log behind so overfull boxes can be read back.
	command := exec.CommandContext(ctx, binary, "-X", "compile", texPath,
		"--outfmt", "pdf", "--print", "--keep-logs", "--keep-intermediates")
	var chatter bytes.Buffer
	command.Stdout = &chatter
	command.Stderr = &chatter

	runErr := command.Run()
	output := chatter.String()

	// The .log carries far more detail than stdout; merge both before parsing so
	// a failure that only shows up in one of them is still reported.
	logText := output
	if fromFile, err := os.ReadFile(filepath.Join(runDir, "resume.log")); err == nil {
		logText = output + "\n" + string(fromFile)
	}

	if runErr != nil {
		return nil, fmt.Errorf("tectonic: %w\n%s", runErr, diagnose(logText))
	}

	pdf, err := os.ReadFile(filepath.Join(runDir, "resume.pdf"))
	if err != nil {
		return nil, fmt.Errorf("tectonic reported success but produced no PDF: %w", err)
	}

	pages, pagesKnown := parsePages(logText)
	return &Result{
		PDF:        pdf,
		Pages:      pages,
		PagesKnown: pagesKnown,
		Overfull:   parseOverfull(logText),
		Log:        logText,
	}, nil
}

// parsePages reads the engine's "(N pages, ...)" summary. It reports whether a
// count was found at all, because silently returning 0 would make every page
// budget pass.
func parsePages(logText string) (int, bool) {
	match := pagesPattern.FindStringSubmatch(logText)
	if match == nil {
		return 0, false
	}
	count, err := strconv.Atoi(match[1])
	if err != nil {
		return 0, false
	}
	return count, true
}

func parseOverfull(logText string) []Overflow {
	var found []Overflow
	lines := strings.Split(logText, "\n")
	for index, line := range lines {
		match := overfullPattern.FindStringSubmatch(line)
		if match == nil {
			continue
		}
		points, _ := strconv.ParseFloat(match[1], 64)
		overflow := Overflow{Points: points, Detail: strings.TrimSpace(line)}
		if hint := lineHintPattern.FindStringSubmatch(line); hint != nil {
			overflow.Line, _ = strconv.Atoi(hint[1])
		}
		// TeX prints the offending text on the following line; it is the only
		// clue about which block overflowed.
		if index+1 < len(lines) {
			if snippet := strings.TrimSpace(lines[index+1]); snippet != "" && !strings.HasPrefix(snippet, "Overfull") {
				overflow.Detail = strings.TrimSpace(line) + " | " + truncate(snippet, 90)
			}
		}
		found = append(found, overflow)
	}
	return found
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit] + "..."
}

// diagnose pulls the actual complaint out of a TeX log.
//
// A failing run leaves tens of thousands of lines of package chatter, and the
// error is rarely near the end — the engine keeps loading packages after it.
// Printing a blind tail therefore shows the last thing that loaded rather than
// the thing that broke, which is worse than useless when reading CI output.
func diagnose(logText string) string {
	lines := strings.Split(logText, "\n")
	var found []string

	for index, line := range lines {
		trimmed := strings.TrimSpace(line)
		isTeXError := strings.HasPrefix(trimmed, "!")
		isToolError := strings.HasPrefix(trimmed, "error:") ||
			strings.Contains(trimmed, "not found") ||
			strings.Contains(trimmed, "Emergency stop")
		if !isTeXError && !isToolError {
			continue
		}

		found = append(found, trimmed)
		// TeX reports the offending source line a few lines below the message,
		// as "l.<number> <text>". That is the part that says where to look.
		for offset := 1; offset <= 4 && index+offset < len(lines); offset++ {
			next := strings.TrimSpace(lines[index+offset])
			if strings.HasPrefix(next, "l.") {
				found = append(found, "  "+next)
				break
			}
		}
		if len(found) >= 12 {
			break
		}
	}

	if len(found) == 0 {
		// Nothing matched, so fall back to the tail rather than reporting
		// silence.
		return tail(logText, 30)
	}
	return strings.Join(found, "\n")
}

func tail(value string, lines int) string {
	split := strings.Split(strings.TrimRight(value, "\n"), "\n")
	if len(split) <= lines {
		return strings.Join(split, "\n")
	}
	return strings.Join(split[len(split)-lines:], "\n")
}
