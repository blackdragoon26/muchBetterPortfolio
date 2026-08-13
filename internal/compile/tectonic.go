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
	PDF      []byte
	Pages    int
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

var (
	pagesPattern    = regexp.MustCompile(`\((\d+) pages?,`)
	overfullPattern = regexp.MustCompile(`Overfull \\[hv]box \(([\d.]+)pt too wide\)`)
	lineHintPattern = regexp.MustCompile(`(?:at lines? |lines? )(\d+)`)
)

// Run compiles the given LaTeX source and returns the PDF plus its fit report.
func (c *Compiler) Run(ctx context.Context, source string) (*Result, error) {
	if err := os.MkdirAll(c.WorkDir, 0o755); err != nil {
		return nil, err
	}
	texPath := filepath.Join(c.WorkDir, "resume.tex")
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
	if fromFile, err := os.ReadFile(filepath.Join(c.WorkDir, "resume.log")); err == nil {
		logText = output + "\n" + string(fromFile)
	}

	if runErr != nil {
		return nil, fmt.Errorf("tectonic: %w\n%s", runErr, tail(logText, 40))
	}

	pdf, err := os.ReadFile(filepath.Join(c.WorkDir, "resume.pdf"))
	if err != nil {
		return nil, fmt.Errorf("tectonic reported success but produced no PDF: %w", err)
	}

	return &Result{
		PDF:      pdf,
		Pages:    parsePages(output),
		Overfull: parseOverfull(logText),
		Log:      logText,
	}, nil
}

func parsePages(output string) int {
	match := pagesPattern.FindStringSubmatch(output)
	if match == nil {
		return 0
	}
	count, err := strconv.Atoi(match[1])
	if err != nil {
		return 0
	}
	return count
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

func tail(value string, lines int) string {
	split := strings.Split(strings.TrimRight(value, "\n"), "\n")
	if len(split) <= lines {
		return strings.Join(split, "\n")
	}
	return strings.Join(split[len(split)-lines:], "\n")
}
