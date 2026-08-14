// Package totp implements RFC 6238 time-based one-time passwords.
//
// Only the standard algorithm is here — SHA-1, 30-second steps, six digits —
// because that is what every authenticator app accepts without configuration.
// It uses nothing outside the standard library.
package totp

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const (
	// Step is the code lifetime. Thirty seconds is what authenticator apps assume.
	Step = 30 * time.Second

	// Digits is the code length.
	Digits = 6

	// Skew is how many steps either side of now are accepted, to tolerate a
	// phone whose clock drifts from the server's. One step each way is the
	// usual compromise: it widens the window to 90 seconds rather than 30,
	// which matters much less than rate limiting does.
	Skew = 1
)

// Secret is a shared TOTP key.
type Secret struct {
	// Base32 is the encoding authenticator apps expect, unpadded and uppercase.
	Base32 string
}

// NewSecret generates a 160-bit secret, the size RFC 4226 recommends for SHA-1.
func NewSecret() (Secret, error) {
	raw := make([]byte, 20)
	if _, err := rand.Read(raw); err != nil {
		return Secret{}, err
	}
	return Secret{Base32: base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(raw)}, nil
}

// ParseSecret accepts the base32 form, tolerating the spaces and lowercase that
// people introduce when copying a key by hand.
func ParseSecret(value string) (Secret, error) {
	cleaned := strings.ToUpper(strings.NewReplacer(" ", "", "-", "", "=", "").Replace(value))
	if cleaned == "" {
		return Secret{}, fmt.Errorf("secret is empty")
	}
	if _, err := decode(cleaned); err != nil {
		return Secret{}, fmt.Errorf("secret is not valid base32: %w", err)
	}
	return Secret{Base32: cleaned}, nil
}

func decode(base32Secret string) ([]byte, error) {
	return base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(base32Secret)
}

// Code computes the code for a specific time, exposed for tests and for
// verifying an enrolment before it is trusted.
func (s Secret) Code(at time.Time) (string, error) {
	key, err := decode(s.Base32)
	if err != nil {
		return "", err
	}
	return code(key, uint64(at.Unix())/uint64(Step.Seconds())), nil
}

// Counter returns the time step a moment falls in. The server records the last
// step it accepted so a code cannot be replayed inside its own validity window.
func Counter(at time.Time) uint64 {
	return uint64(at.Unix()) / uint64(Step.Seconds())
}

// Verify reports whether presented matches the secret at the given time, and
// returns the counter that matched so the caller can refuse to accept it twice.
//
// A code stays valid for its whole step, so without replay protection anyone who
// observes one — over someone's shoulder, in a screenshot — can reuse it for the
// remainder of that window.
func (s Secret) Verify(presented string, at time.Time) (uint64, bool) {
	presented = strings.TrimSpace(strings.ReplaceAll(presented, " ", ""))
	if len(presented) != Digits {
		return 0, false
	}
	key, err := decode(s.Base32)
	if err != nil {
		return 0, false
	}

	current := Counter(at)
	for offset := -Skew; offset <= Skew; offset++ {
		candidate := uint64(int64(current) + int64(offset))
		// Constant-time comparison: a timing difference would leak how many
		// leading digits were correct, which turns a million guesses into far
		// fewer.
		if subtle.ConstantTimeCompare([]byte(code(key, candidate)), []byte(presented)) == 1 {
			return candidate, true
		}
	}
	return 0, false
}

func code(key []byte, counter uint64) string {
	var message [8]byte
	binary.BigEndian.PutUint64(message[:], counter)

	mac := hmac.New(sha1.New, key)
	mac.Write(message[:])
	sum := mac.Sum(nil)

	// Dynamic truncation, RFC 4226 section 5.3.
	offset := sum[len(sum)-1] & 0x0f
	truncated := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff

	divisor := uint32(1)
	for range Digits {
		divisor *= 10
	}
	return fmt.Sprintf("%0*d", Digits, truncated%divisor)
}

// ProvisioningURI builds the otpauth:// URI that authenticator apps consume.
// Apps that cannot scan a QR code accept the secret typed in by hand instead.
func (s Secret) ProvisioningURI(issuer, account string) string {
	label := url.PathEscape(issuer + ":" + account)
	query := url.Values{}
	query.Set("secret", s.Base32)
	query.Set("issuer", issuer)
	query.Set("algorithm", "SHA1")
	query.Set("digits", fmt.Sprint(Digits))
	query.Set("period", fmt.Sprint(int(Step.Seconds())))
	return "otpauth://totp/" + label + "?" + query.Encode()
}
