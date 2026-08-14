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
