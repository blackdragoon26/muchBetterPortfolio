package compile

import "strings"
import "testing"

// A failing TeX run buries its error under thousands of lines of package
// chatter, and keeps loading packages afterwards — so the error is usually
// nowhere near the end of the log.
func TestDiagnoseFindsTheErrorNotTheTail(t *testing.T) {
	log := strings.Join([]string{
		"(hw.tex",
		"LaTeX2e <2021-11-15>",
		"! LaTeX Error: File `xparse.sty' not found.",
		"",
		"Type X to quit.",
		"l.23 \\RequirePackage{xparse}[2013/12/31]",
		"(pgfrcs.code.tex",
		"Package: pgfrcs 2021/05/15",
		"(pgfsys.sty",
	}, "\n")

	got := diagnose(log)
	if !strings.Contains(got, "xparse.sty' not found") {
		t.Errorf("diagnose() lost the error:\n%s", got)
	}
	if !strings.Contains(got, "l.23") {
		t.Errorf("diagnose() lost the source line:\n%s", got)
	}
	// The trailing package noise is exactly what a blind tail would have shown.
	if strings.Contains(got, "pgfsys.sty") {
		t.Errorf("diagnose() included trailing noise:\n%s", got)
	}
}

func TestDiagnoseFallsBackWhenNothingMatches(t *testing.T) {
	log := "loading a\nloading b\nloading c"
	if got := diagnose(log); got == "" {
		t.Error("diagnose() returned nothing; expected a fallback tail")
	}
}

func TestParsePagesReportsWhenUnknown(t *testing.T) {
	if _, known := parsePages("no summary here"); known {
		t.Error("parsePages() claimed a page count it never saw")
	}
	pages, known := parsePages("Output written on resume.xdv (2 pages, 101432 bytes).")
	if !known || pages != 2 {
		t.Errorf("parsePages() = %d, %v; want 2, true", pages, known)
	}
}
