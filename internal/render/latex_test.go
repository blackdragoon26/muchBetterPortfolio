package render

import "testing"

// The expectations below were generated from the existing JavaScript pipeline in
// scripts/generate-resume-highlights.mjs and then corrected in three places
// where that implementation is wrong. Each correction is called out on the case.
func TestLatexBoldNumbers(t *testing.T) {
	cases := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "metrics in a project impact line",
			input: "Qualified 10,100 RX and TX ring wraps across 646,400 packets at zero loss, 1,000 interface cycles, 100 driver rebinds, and 100 reset-under-traffic cycles",
			want:  `Qualified \textbf{10,100} RX and TX ring wraps across \textbf{646,400} packets at zero loss, \textbf{1,000} interface cycles, \textbf{100} driver rebinds, and \textbf{100} reset-under-traffic cycles`,
		},
		{
			name:  "percentages keep their escaped sign inside the bold",
			input: "improving deployment reliability by 30%, and optimized SID recirculation to achieve 10 Gbps line-rate throughput with 20% lower inference latency.",
			want:  `improving deployment reliability by \textbf{30\%}, and optimized SID recirculation to achieve \textbf{10} Gbps line-rate throughput with \textbf{20\%} lower inference latency.`,
		},
		{
			name:  "thousands separators stay inside the number",
			input: "Determine whether a startup idea already exists by comparing it against more than 500,000 company records.",
			want:  `Determine whether a startup idea already exists by comparing it against more than \textbf{500,000} company records.`,
		},
		{
			name:  "part numbers are never bolded",
			input: "Built a clean-room Intel 82540EM/e1000-compatible PCI Ethernet driver",
			want:  `Built a clean-room Intel 82540EM/e1000-compatible PCI Ethernet driver`,
		},
		{
			name:  "version and register suffixes are never bolded",
			input: "XNIC v1 with W5500 SPI and BAR0 MMIO",
			want:  `XNIC v1 with W5500 SPI and BAR0 MMIO`,
		},
		{
			name:  "plus-suffixed counts bold as a unit",
			input: "Co-led 10+ events, 31+ crew, 800+ audience",
			want:  `Co-led \textbf{10+} events, \textbf{31+} crew, \textbf{800+} audience`,
		},
		{
			name:  "multiplier suffix binds to the number",
			input: "up to 5x lower inference latency than control-plane inference.",
			want:  `up to \textbf{5x} lower inference latency than control-plane inference.`,
		},
		{
			name:  "underscores and ampersands escape around a bolded metric",
			input: "net_pcap virtual PMD & 100% CPU usage",
			want:  `net\_pcap virtual PMD \& \textbf{100\%} CPU usage`,
		},
		{
			name:  "dotted versions stay whole",
			input: "Version 1.5.2 released",
			want:  `Version \textbf{1.5.2} released`,
		},

		// Correction 1. The JavaScript emits \textbf{2023,} \textbf{2024}, pulling
		// the comma inside the bold because [\d,.]* is greedy and the lookahead
		// only rejects alphanumerics. Trailing separators belong to the sentence.
		{
			name:  "a separator after a number stays outside the bold",
			input: "2x AKTU State TT Gold (2023, 2024)",
			want:  `\textbf{2x} AKTU State TT Gold (\textbf{2023}, \textbf{2024})`,
		},

		// Correction 2. The JavaScript emits x86\_\textbf{64,} because underscore
		// is not in its lookbehind class, so it bolds a fragment of an identifier.
		{
			name:  "digits inside an identifier are left alone",
			input: "Linux (x86_64, ARM64 & AMD64)",
			want:  `Linux (x86\_64, ARM64 \& AMD64)`,
		},

		// Correction 3. The JavaScript emits a\textbackslash\{\}b because it
		// escapes the braces it just introduced for the backslash itself.
		{
			name:  "a literal backslash survives escaping",
			input: `a\b backslash test`,
			want:  `a\textbackslash{}b backslash test`,
		},

		{
			name:  "assorted specials escape without disturbing bolding",
			input: "C++ / C# cost $5 (50% off) ~approx ^2",
			want:  `C++ / C\# cost \$\textbf{5} (\textbf{50\%} off) \textasciitilde{}approx \textasciicircum{}\textbf{2}`,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := LatexBoldNumbers(testCase.input); got != testCase.want {
				t.Errorf("LatexBoldNumbers(%q)\n got: %s\nwant: %s", testCase.input, got, testCase.want)
			}
		})
	}
}

func TestLatexEscapesSpecials(t *testing.T) {
	cases := map[string]string{
		"100% & rising":   `100\% \& rising`,
		"a_b {c} #d":      `a\_b \{c\} \#d`,
		"tilde ~ caret ^": `tilde \textasciitilde{} caret \textasciicircum{}`,
		"em — dash":       `em - dash`,
		"“quoted”":        `"quoted"`,
		"ellipsis…":       `ellipsis...`,
	}
	for input, want := range cases {
		if got := Latex(input); got != want {
			t.Errorf("Latex(%q) = %s, want %s", input, got, want)
		}
	}
}

func TestHrefStripsBraces(t *testing.T) {
	got := Href("https://example.com/a{b}c")
	if want := "https://example.com/abc"; got != want {
		t.Errorf("Href() = %q, want %q", got, want)
	}
}
