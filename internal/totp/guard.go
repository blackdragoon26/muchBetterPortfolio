package totp

import (
	"fmt"
	"sync"
	"time"
)

// Guard rate-limits verification attempts and refuses replayed codes.
//
// A six-digit code is one of a million, which sounds like a lot and is not: an
// unthrottled attacker gets through in hours. The code itself is therefore only
// half the control — this is the other half, and without it TOTP would be
// weaker than the long random token it replaces.
//
// Locking is global rather than per-IP on purpose. This is a single-user tool,
// so there is no legitimate traffic to protect from a shared limit, and per-IP
// buckets would let an attacker with many addresses keep guessing.
type Guard struct {
	// MaxFailures before the door closes.
	MaxFailures int
	// Lockout is how long it stays closed. Each further failure while locked
	// restarts the clock, so sustained guessing keeps it shut.
	Lockout time.Duration

	mu       sync.Mutex
	failures int
	lockedAt time.Time

	// usedCounters records the time steps already spent, so a code observed by
	// someone else cannot be replayed during the rest of its validity window.
	usedCounters map[uint64]bool
}

// NewGuard returns a Guard with defaults suited to one human logging in.
func NewGuard() *Guard {
	return &Guard{
		MaxFailures:  5,
		Lockout:      5 * time.Minute,
		usedCounters: map[uint64]bool{},
	}
}

// ErrLocked reports how long remains before attempts are accepted again.
type ErrLocked struct{ Remaining time.Duration }

func (e ErrLocked) Error() string {
	return fmt.Sprintf("too many failed attempts, try again in %s", e.Remaining.Round(time.Second))
}

// ErrReplayed is returned when a correct code has already been used.
type ErrReplayed struct{}

func (ErrReplayed) Error() string { return "that code has already been used, wait for the next one" }

// ErrIncorrect is returned for a wrong code.
type ErrIncorrect struct{}

func (ErrIncorrect) Error() string { return "incorrect code" }

// Check verifies a code, applying the lockout and replay rules. A nil error
// means the caller may establish a session.
func (g *Guard) Check(secret Secret, presented string, now time.Time) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if remaining := g.remainingLockout(now); remaining > 0 {
		// Count attempts made while locked, so hammering extends the lockout
		// rather than waiting it out.
		g.failures++
		g.lockedAt = now
		return ErrLocked{Remaining: remaining}
	}

	counter, ok := secret.Verify(presented, now)
	if !ok {
		g.failures++
		if g.failures >= g.MaxFailures {
			g.lockedAt = now
		}
		return ErrIncorrect{}
	}

	if g.usedCounters[counter] {
		// A replay is not a wrong guess, but it must not open a session either.
		return ErrReplayed{}
	}

	g.usedCounters[counter] = true
	g.pruneUsed(now)
	g.failures = 0
	g.lockedAt = time.Time{}
	return nil
}

func (g *Guard) remainingLockout(now time.Time) time.Duration {
	if g.failures < g.MaxFailures || g.lockedAt.IsZero() {
		return 0
	}
	elapsed := now.Sub(g.lockedAt)
	if elapsed >= g.Lockout {
		// The lockout expired; start the next window from a clean slate.
		g.failures = 0
		g.lockedAt = time.Time{}
		return 0
	}
	return g.Lockout - elapsed
}

// pruneUsed drops counters that can no longer be presented, so the map cannot
// grow without bound in a long-running process.
func (g *Guard) pruneUsed(now time.Time) {
	oldest := Counter(now) - uint64(Skew) - 1
	for counter := range g.usedCounters {
		if counter < oldest {
			delete(g.usedCounters, counter)
		}
	}
}

// Status reports whether the guard is currently locked, for the login response.
func (g *Guard) Status(now time.Time) (locked bool, remaining time.Duration) {
	g.mu.Lock()
	defer g.mu.Unlock()
	remaining = g.remainingLockout(now)
	return remaining > 0, remaining
}
