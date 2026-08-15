package passkey

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

// Authenticator runs the WebAuthn registration and login ceremonies.
type Authenticator struct {
	web   *webauthn.WebAuthn
	store *Store

	// Each ceremony spans two requests, so the challenge issued by the first
	// has to be remembered for the second. They are held in memory and expire
	// quickly: a stale challenge is a replay opportunity, and losing them on
	// restart only costs an interrupted sign-in.
	mu       sync.Mutex
	sessions map[string]pending
}

type pending struct {
	data    *webauthn.SessionData
	expires time.Time
	label   string
}

// sessionLifetime bounds how long a challenge stays usable.
const sessionLifetime = 3 * time.Minute

// New builds an Authenticator for one origin.
//
// origin must be the exact URL the browser sees, scheme included, because
// WebAuthn binds every assertion to it — that binding is what makes passkeys
// phishing-resistant, and a mismatch is a rejection rather than a warning.
func New(store *Store, origin string) (*Authenticator, error) {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return nil, fmt.Errorf("origin %q must be an absolute URL such as https://resume.example.dev", origin)
	}

	web, err := webauthn.New(&webauthn.Config{
		RPDisplayName: "Résumé Builder",
		// The relying-party ID is the bare hostname; a credential is scoped to
		// it and cannot be used on any other site.
		RPID:      parsed.Hostname(),
		RPOrigins: []string{strings.TrimSuffix(origin, "/")},
		Timeouts: webauthn.TimeoutsConfig{
			Login:        webauthn.TimeoutConfig{Enforce: true, Timeout: sessionLifetime},
			Registration: webauthn.TimeoutConfig{Enforce: true, Timeout: sessionLifetime},
		},
	})
	if err != nil {
		return nil, err
	}
	return &Authenticator{web: web, store: store, sessions: map[string]pending{}}, nil
}

// BeginRegistration starts enrolling the device making the request.
func (a *Authenticator) BeginRegistration(label string) (any, string, error) {
	options, session, err := a.web.BeginRegistration(a.store.Owner(),
		// Excluding what is already enrolled makes the platform say "already
		// registered" instead of silently creating a duplicate credential.
		webauthn.WithExclusions(a.excludeExisting()),
	)
	if err != nil {
		return nil, "", err
	}
	return options, a.remember(session, label), nil
}

// FinishRegistration completes enrolment and stores the credential.
func (a *Authenticator) FinishRegistration(token string, r *http.Request) (Record, error) {
	held, ok := a.take(token)
	if !ok {
		return Record{}, fmt.Errorf("this enrolment expired; start again")
	}
	credential, err := a.web.FinishRegistration(a.store.Owner(), *held.data, r)
	if err != nil {
		return Record{}, err
	}
	if err := a.store.Add(held.label, credential); err != nil {
		return Record{}, err
	}
	for _, record := range a.store.List() {
		if record.ID() == base64ID(credential.ID) {
			return record, nil
		}
	}
	return Record{}, nil
}

// BeginLogin starts a sign-in.
func (a *Authenticator) BeginLogin() (any, string, error) {
	if a.store.Len() == 0 {
		return nil, "", fmt.Errorf("no passkey is enrolled yet")
	}
	options, session, err := a.web.BeginLogin(a.store.Owner())
	if err != nil {
		return nil, "", err
	}
	return options, a.remember(session, ""), nil
}

// FinishLogin verifies an assertion. A nil error means the caller may open a
// session.
func (a *Authenticator) FinishLogin(token string, r *http.Request) error {
	held, ok := a.take(token)
	if !ok {
		return fmt.Errorf("this sign-in expired; try again")
	}
	credential, err := a.web.FinishLogin(a.store.Owner(), *held.data, r)
	if err != nil {
		return err
	}
	// The library flags a sign count that went backwards, which suggests a
	// cloned authenticator. Refuse rather than record it.
	if credential.Authenticator.CloneWarning {
		return fmt.Errorf("this authenticator reported a cloned state and was refused")
	}
	return a.store.Touch(credential)
}

func (a *Authenticator) excludeExisting() []protocol.CredentialDescriptor {
	var exclude []protocol.CredentialDescriptor
	for _, record := range a.store.List() {
		exclude = append(exclude, protocol.CredentialDescriptor{
			Type:         protocol.PublicKeyCredentialType,
			CredentialID: record.Credential.ID,
		})
	}
	return exclude
}

func (a *Authenticator) remember(session *webauthn.SessionData, label string) string {
	token := randomToken()

	a.mu.Lock()
	defer a.mu.Unlock()
	// Drop anything expired on the way past, so an abandoned ceremony cannot
	// accumulate in a long-running process.
	now := time.Now()
	for key, held := range a.sessions {
		if now.After(held.expires) {
			delete(a.sessions, key)
		}
	}
	a.sessions[token] = pending{data: session, expires: now.Add(sessionLifetime), label: label}
	return token
}

// take returns a pending ceremony and removes it, so a challenge is single-use.
func (a *Authenticator) take(token string) (pending, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	held, ok := a.sessions[token]
	delete(a.sessions, token)
	if !ok || time.Now().After(held.expires) {
		return pending{}, false
	}
	return held, true
}
