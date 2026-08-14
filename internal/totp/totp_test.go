package totp

import (
	"encoding/base32"
	"testing"
	"time"
)

// rfcSecret is the SHA-1 key from RFC 6238 appendix B: the ASCII string
// "12345678901234567890".
func rfcSecret(t *testing.T) Secret {
	t.Helper()
	raw := []byte("12345678901234567890")
	return Secret{Base32: base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(raw)}
}

// TestRFC6238Vectors checks the implementation against the published test
// vectors. They are given as eight digits; a six-digit code is the last six.
func TestRFC6238Vectors(t *testing.T) {
	secret := rfcSecret(t)
	cases := []struct {
		unix int64
		want string // last 6 of the RFC's 8-digit value
	}{
		{59, "287082"},          // 94287082
		{1111111109, "081804"},  // 07081804
		{1111111111, "050471"},  // 14050471
		{1234567890, "005924"},  // 89005924
		{2000000000, "279037"},  // 69279037
		{20000000000, "353130"}, // 65353130
	}
	for _, testCase := range cases {
		got, err := secret.Code(time.Unix(testCase.unix, 0).UTC())
		if err != nil {
			t.Fatal(err)
		}
		if got != testCase.want {
			t.Errorf("Code(%d) = %s, want %s", testCase.unix, got, testCase.want)
		}
	}
}

func TestVerifyAcceptsClockSkew(t *testing.T) {
	secret := rfcSecret(t)
	now := time.Unix(1111111109, 0).UTC()
	code, err := secret.Code(now)
	if err != nil {
		t.Fatal(err)
	}

	// A phone one step ahead or behind the server must still work.
	for _, drift := range []time.Duration{-Step, 0, Step} {
		if _, ok := secret.Verify(code, now.Add(drift)); !ok {
			t.Errorf("code rejected at drift %v, want accepted", drift)
		}
	}
	// Two steps out is beyond the window and must fail, or the code would stay
	// valid far longer than its lifetime.
	for _, drift := range []time.Duration{-2 * Step, 2 * Step} {
		if _, ok := secret.Verify(code, now.Add(drift)); ok {
			t.Errorf("code accepted at drift %v, want rejected", drift)
		}
	}
}

func TestVerifyRejectsMalformedInput(t *testing.T) {
	secret := rfcSecret(t)
	now := time.Unix(1111111109, 0).UTC()
	for _, bad := range []string{"", "12345", "1234567", "abcdef", "  ", "07081804"} {
		if _, ok := secret.Verify(bad, now); ok {
			t.Errorf("Verify(%q) accepted, want rejected", bad)
		}
	}
}

func TestVerifyToleratesSpacing(t *testing.T) {
	secret := rfcSecret(t)
	now := time.Unix(1111111109, 0).UTC()
	// Authenticator apps display codes as "081 804" and people paste that.
	if _, ok := secret.Verify("081 804", now); !ok {
		t.Error("a code with a space was rejected")
	}
}

func TestCounterIdentifiesTheStep(t *testing.T) {
	// Deliberately the first second of a step. 1111111109 sits on the last
	// second of its step, where adding a second correctly crosses into the next
	// one — a fine boundary to have, but not what this test is checking.
	start := time.Unix(1111111080, 0).UTC()
	if Counter(start)%1 != 0 || time.Unix(1111111080, 0).Unix()%int64(Step.Seconds()) != 0 {
		t.Fatalf("test setup: %d is not a step boundary", start.Unix())
	}

	// Replay protection depends on two codes in the same window sharing a
	// counter, and the next window differing.
	if Counter(start) != Counter(start.Add(Step-time.Second)) {
		t.Error("times inside one step produced different counters")
	}
	if Counter(start) == Counter(start.Add(Step)) {
		t.Error("times a step apart produced the same counter")
	}
}

func TestParseSecretNormalises(t *testing.T) {
	original, err := NewSecret()
	if err != nil {
		t.Fatal(err)
	}
	// People retype keys with the spacing and case that apps display.
	messy := "  " + spaceEvery(4, original.Base32) + "  "
	parsed, err := ParseSecret(messy)
	if err != nil {
		t.Fatalf("ParseSecret rejected a spaced key: %v", err)
	}
	if parsed.Base32 != original.Base32 {
		t.Errorf("ParseSecret = %s, want %s", parsed.Base32, original.Base32)
	}
}

func TestParseSecretRejectsGarbage(t *testing.T) {
	for _, bad := range []string{"", "not base32 !!", "0189"} {
		if _, err := ParseSecret(bad); err == nil {
			t.Errorf("ParseSecret(%q) succeeded, want an error", bad)
		}
	}
}

func TestNewSecretIsDistinct(t *testing.T) {
	first, err := NewSecret()
	if err != nil {
		t.Fatal(err)
	}
	second, err := NewSecret()
	if err != nil {
		t.Fatal(err)
	}
	if first.Base32 == second.Base32 {
		t.Error("two generated secrets were identical")
	}
	if len(first.Base32) != 32 {
		t.Errorf("secret is %d chars, want 32 (160 bits base32)", len(first.Base32))
	}
}

func spaceEvery(n int, value string) string {
	var out []byte
	for index := 0; index < len(value); index++ {
		if index > 0 && index%n == 0 {
			out = append(out, ' ')
		}
		out = append(out, value[index])
	}
	return string(out)
}
