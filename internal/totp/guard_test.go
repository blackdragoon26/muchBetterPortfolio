package totp

import (
	"errors"
	"testing"
	"time"
)

func guardFixture(t *testing.T) (*Guard, Secret, time.Time) {
	t.Helper()
	// Start of a step, so a code stays valid for the whole test unless the
	// clock is advanced deliberately.
	return NewGuard(), rfcSecret(t), time.Unix(1111111080, 0).UTC()
}

func TestGuardAcceptsAValidCode(t *testing.T) {
	guard, secret, now := guardFixture(t)
	code, err := secret.Code(now)
	if err != nil {
		t.Fatal(err)
	}
	if err := guard.Check(secret, code, now); err != nil {
		t.Errorf("Check() = %v, want nil", err)
	}
}

// Without this, anyone who glimpses a code can reuse it for the rest of its
// window — up to 90 seconds given the skew allowance.
func TestGuardRefusesAReplayedCode(t *testing.T) {
	guard, secret, now := guardFixture(t)
	code, err := secret.Code(now)
	if err != nil {
		t.Fatal(err)
	}
	if err := guard.Check(secret, code, now); err != nil {
		t.Fatalf("first use failed: %v", err)
	}

	var replayed ErrReplayed
	if err := guard.Check(secret, code, now.Add(3*time.Second)); !errors.As(err, &replayed) {
		t.Errorf("second use of the same code = %v, want ErrReplayed", err)
	}
}

func TestGuardLocksOutAfterRepeatedFailures(t *testing.T) {
	guard, secret, now := guardFixture(t)

	for attempt := 1; attempt <= guard.MaxFailures; attempt++ {
		var incorrect ErrIncorrect
		if err := guard.Check(secret, "000000", now); !errors.As(err, &incorrect) {
			t.Fatalf("attempt %d = %v, want ErrIncorrect", attempt, err)
		}
	}

	// The door is shut now, and even the correct code must not open it.
	code, err := secret.Code(now)
	if err != nil {
		t.Fatal(err)
	}
	var locked ErrLocked
	if err := guard.Check(secret, code, now); !errors.As(err, &locked) {
		t.Fatalf("after %d failures = %v, want ErrLocked", guard.MaxFailures, err)
	}
}

// Guessing during a lockout must not simply wait it out.
func TestGuardExtendsLockoutWhileAttacked(t *testing.T) {
	guard, secret, now := guardFixture(t)
	for range guard.MaxFailures {
		guard.Check(secret, "000000", now)
	}

	// Keep hammering until just before the original lockout would expire.
	hammerUntil := now.Add(guard.Lockout - time.Second)
	for at := now; at.Before(hammerUntil); at = at.Add(30 * time.Second) {
		guard.Check(secret, "000000", at)
	}

	// The window restarted from the last attempt, so it is still locked well
	// past the original expiry.
	locked, remaining := guard.Status(hammerUntil.Add(2 * time.Second))
	if !locked {
		t.Error("guard unlocked despite continuous attempts")
	}
	if remaining <= 0 {
		t.Errorf("remaining = %v, want positive", remaining)
	}
}

func TestGuardUnlocksAfterQuiet(t *testing.T) {
	guard, secret, now := guardFixture(t)
	for range guard.MaxFailures {
		guard.Check(secret, "000000", now)
	}

	later := now.Add(guard.Lockout + time.Second)
	code, err := secret.Code(later)
	if err != nil {
		t.Fatal(err)
	}
	if err := guard.Check(secret, code, later); err != nil {
		t.Errorf("after the lockout elapsed = %v, want nil", err)
	}
}

func TestGuardResetsFailuresOnSuccess(t *testing.T) {
	guard, secret, now := guardFixture(t)
	for range guard.MaxFailures - 1 {
		guard.Check(secret, "000000", now)
	}

	code, err := secret.Code(now)
	if err != nil {
		t.Fatal(err)
	}
	if err := guard.Check(secret, code, now); err != nil {
		t.Fatalf("valid code after near-misses = %v, want nil", err)
	}

	// A fresh budget of attempts, rather than one failure from lockout.
	var incorrect ErrIncorrect
	if err := guard.Check(secret, "000000", now.Add(time.Minute)); !errors.As(err, &incorrect) {
		t.Errorf("after success the counter did not reset: %v", err)
	}
}

// A long-lived process must not accumulate used counters forever.
func TestGuardPrunesUsedCounters(t *testing.T) {
	guard, secret, now := guardFixture(t)
	for step := range 50 {
		at := now.Add(time.Duration(step) * Step)
		code, err := secret.Code(at)
		if err != nil {
			t.Fatal(err)
		}
		if err := guard.Check(secret, code, at); err != nil {
			t.Fatalf("step %d: %v", step, err)
		}
	}
	if size := len(guard.usedCounters); size > 4 {
		t.Errorf("usedCounters holds %d entries after 50 logins, want it pruned", size)
	}
}
