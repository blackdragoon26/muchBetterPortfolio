package manifest

import "testing"

func base() *Manifest {
	return &Manifest{
		ID:     "demo",
		Output: "public/resume/demo.pdf",
		Sections: []Section{
			{Heading: "Projects", Blocks: []Entry{{Block: "project:one"}}},
		},
	}
}

// Output arrives from the builder over HTTP and is handed to os.WriteFile by
// resumekit, so it is the one manifest field an attacker controls that touches
// the filesystem.
func TestValidateRejectsUnsafeOutput(t *testing.T) {
	unsafe := map[string]string{
		"absolute path":          "/etc/cron.d/payload.pdf",
		"home-relative path":     "~/evil.pdf",
		"parent traversal":       "public/resume/../../../../tmp/evil.pdf",
		"outside the output dir": "src/app/page.pdf",
		"bare filename":          "evil.pdf",
		"unnormalised path":      "public/resume/./demo.pdf",
		"wrong extension":        "public/resume/demo.sh",
		"null byte":              "public/resume/demo\x00.pdf",
	}
	for name, output := range unsafe {
		t.Run(name, func(t *testing.T) {
			target := base()
			target.Output = output
			if err := target.Validate(); err == nil {
				t.Errorf("Validate() accepted %q", output)
			}
		})
	}
}

func TestValidateAcceptsOutputUnderResumeDir(t *testing.T) {
	for _, output := range []string{
		"public/resume/demo.pdf",
		"public/resume/nested/demo.pdf",
	} {
		target := base()
		target.Output = output
		if err := target.Validate(); err != nil {
			t.Errorf("Validate() rejected %q: %v", output, err)
		}
	}
}

func TestValidateRejectsDuplicateBlocks(t *testing.T) {
	target := base()
	target.Sections = append(target.Sections, Section{
		Heading: "More",
		Blocks:  []Entry{{Block: "project:one"}},
	})
	if err := target.Validate(); err == nil {
		t.Error("expected an error when a block appears on one résumé twice")
	}
}

func TestValidateRejectsUnknownLayout(t *testing.T) {
	target := base()
	target.Sections[0].Layout = "sideways"
	if err := target.Validate(); err == nil {
		t.Error("expected an error for an unknown layout")
	}
}

// A raw résumé keeps its source in a sidecar .tex file, so it is the one shape
// allowed to carry no sections; a block-based one with none is still an error.
func TestValidateAllowsRawWithoutSections(t *testing.T) {
	target := base()
	target.Sections = nil
	if err := target.Validate(); err == nil {
		t.Error("expected an error for a block résumé with no sections")
	}
	target.Raw = true
	if err := target.Validate(); err != nil {
		t.Errorf("Validate() rejected a raw résumé with no sections: %v", err)
	}
}

func TestWebPath(t *testing.T) {
	target := base()
	target.Output = "public/resume/Sankalp-Jha-Backend.pdf"
	if got, want := target.WebPath(), "/resume/Sankalp-Jha-Backend.pdf"; got != want {
		t.Errorf("WebPath() = %q, want %q", got, want)
	}
}

func TestFeaturedPrefersFlaggedThenFirst(t *testing.T) {
	first := base()
	first.ID = "aaa"
	first.Output = "public/resume/aaa.pdf"
	flagged := base()
	flagged.ID = "backend"
	flagged.Label = "Backend"
	flagged.Output = "public/resume/Sankalp-Jha-Backend.pdf"
	flagged.Featured = true
	manifests := []*Manifest{first, flagged}

	pointer, ok := Featured(manifests)
	if !ok {
		t.Fatal("Featured() returned ok=false for a non-empty set")
	}
	if pointer.ID != "backend" {
		t.Errorf("Featured picked %q, want the flagged manifest %q", pointer.ID, "backend")
	}
	if pointer.Path != "/resume/Sankalp-Jha-Backend.pdf" || pointer.FileName != "Sankalp-Jha-Backend.pdf" {
		t.Errorf("Featured derived path/filename wrong: %+v", pointer)
	}

	// With nothing flagged it falls back to the first manifest so the home page
	// always has a target.
	flagged.Featured = false
	pointer, _ = Featured(manifests)
	if pointer.ID != "aaa" {
		t.Errorf("Featured fallback picked %q, want the first manifest %q", pointer.ID, "aaa")
	}
}
