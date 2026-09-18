package render

import "testing"

// Inline emphasis is the only markup block content understands, so its edges
// matter: résumé prose is full of asterisks and underscores that are not markup.
func TestMarkupEmphasis(t *testing.T) {
	cases := map[string]struct{ in, want string }{
		"bold":                 {`**Open Science 101** -- NASA`, `\textbf{Open Science 101} -- NASA`},
		"italic":               {`the *Wall of Fame* list`, `the \textit{Wall of Fame} list`},
		"italic inside bold":   {`**a *b* c**`, `\textbf{a \textit{b} c}`},
		"bold inside italic":   {`*a **b** c*`, `\textit{a \textbf{b} c}`},
		"two runs":             {`*one* and *two*`, `\textit{one} and \textit{two}`},
		"multiplication":       {`5 * 3 * 2`, `5 * 3 * 2`},
		"pointer then star":    {`char *argv and a lone *`, `char *argv and a lone *`},
		"unmatched bold":       {`a ** b`, `a ** b`},
		"empty run":            {`**`, `**`},
		"underscores are text": {`Linux (x86_64, ARM64)`, `Linux (x86\_64, ARM64)`},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			if got := Markup(c.in); got != c.want {
				t.Errorf("Markup(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

// The number bolding and the emphasis markers have to coexist: a metric inside an
// emphasised run must still bold, and must not break the surrounding markup.
func TestMarkupNumbersWithEmphasis(t *testing.T) {
	got := MarkupNumbers(`shipped *30 builds* this week`)
	want := `shipped \textit{\textbf{30} builds} this week`
	if got != want {
		t.Errorf("MarkupNumbers() = %q, want %q", got, want)
	}
}
