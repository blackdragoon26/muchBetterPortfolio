package render

import "testing"

func TestGuardRawTexRejectsUnsafe(t *testing.T) {
	cases := map[string]string{
		"absolute input":        `\input{/run/secrets/resume-builder.env}`,
		"absolute openin":       `\openin\probe=/etc/hosts`,
		"home relative":         `\include{~/.ssh/id_rsa}`,
		"parent traversal":      `\input{../../etc/passwd}`,
		"interior traversal":    `\includegraphics{assets/../../secret.pdf}`,
		"graphics absolute":     `\includegraphics[width=2cm]{/var/secret.png}`,
		"pipe input":            `\input{|"cat /etc/hosts"}`,
		"shell escape":          `\immediate\write18{cat /etc/hosts}`,
		"absolute in graphicspath": `\graphicspath{{/etc/}{img/}}`,
	}
	for name, source := range cases {
		t.Run(name, func(t *testing.T) {
			if err := GuardRawTex(source); err == nil {
				t.Errorf("GuardRawTex accepted unsafe source: %s", source)
			}
		})
	}
}

func TestGuardRawTexAllowsSafe(t *testing.T) {
	cases := map[string]string{
		"plain document":     "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}",
		"relative include":   `\includegraphics{figures/logo.png}`,
		"relative input":     `\input{sections/header}`,
		"commented absolute": `% \input{/etc/hosts} is only a comment` + "\n" + `\input{body}`,
		"percent literal":    `Coverage was 90\% \input{stats}`,
		"no file commands":   `\textbf{Sankalp Jha} \\ \href{https://example.com}{site}`,
	}
	for name, source := range cases {
		t.Run(name, func(t *testing.T) {
			if err := GuardRawTex(source); err != nil {
				t.Errorf("GuardRawTex rejected safe source %q: %v", source, err)
			}
		})
	}
}

// An escaped percent must not be treated as a comment, or a real \input that
// follows one on the same line would be hidden from the guard.
func TestStripTeXCommentsKeepsEscapedPercent(t *testing.T) {
	got := stripTeXComments(`50\% done \input{/etc/hosts}`)
	if want := `50\% done \input{/etc/hosts}`; got != want+"\n" {
		t.Errorf("stripTeXComments(%q) = %q, want %q", `50\% done ...`, got, want)
	}
}
