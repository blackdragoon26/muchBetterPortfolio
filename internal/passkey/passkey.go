// Package passkey adds Touch ID and Face ID sign-in alongside the one-time
// code.
//
// The two are alternatives, not layers. A passkey is the convenient path on a
// device that has one enrolled; the authenticator code stays available for
// every other device and as the way back in if a device is lost. Requiring both
// would make losing a laptop mean losing access.
//
// Only public keys are stored. Unlike the TOTP secret, nothing here is worth
// stealing: an attacker holding this file cannot produce an assertion, because
// the private key never leaves the device's secure enclave.
package passkey

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
)

// Owner is the single account every credential belongs to. This is a personal
// tool, so there is one user and the interface is satisfied with constants.
type Owner struct{ credentials []webauthn.Credential }

func (o *Owner) WebAuthnID() []byte                         { return []byte("resume-builder-owner") }
func (o *Owner) WebAuthnName() string                       { return "owner" }
func (o *Owner) WebAuthnDisplayName() string                { return "Résumé Builder" }
func (o *Owner) WebAuthnCredentials() []webauthn.Credential { return o.credentials }

// Record is one enrolled device, as persisted.
type Record struct {
	// Label is chosen at enrolment so a credential can be recognised later;
	// "MacBook Touch ID" is more use than a base64 blob when revoking one.
	Label      string    `json:"label"`
	AddedAt    time.Time `json:"addedAt"`
	LastUsedAt time.Time `json:"lastUsedAt,omitempty"`

	// Credential is the WebAuthn public-key credential. It contains no secret.
	Credential webauthn.Credential `json:"credential"`
}

// ID returns the credential identifier, base64url encoded for use as a map key
// and in JSON responses.
func (r Record) ID() string {
	return base64.RawURLEncoding.EncodeToString(r.Credential.ID)
}

// Store holds enrolled credentials on disk.
type Store struct {
	path string

	mu      sync.Mutex
	records []Record
}

// Open reads the credential file, treating a missing file as an empty store so
// a fresh deployment simply has no passkeys yet.
func Open(path string) (*Store, error) {
	store := &Store{path: path}
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return store, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &store.records); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return store, nil
}

// Path is where credentials are persisted, for the caller to commit.
func (s *Store) Path() string { return s.path }

// Owner returns the WebAuthn user carrying every enrolled credential.
func (s *Store) Owner() *Owner {
	s.mu.Lock()
	defer s.mu.Unlock()
	owner := &Owner{}
	for _, record := range s.records {
		owner.credentials = append(owner.credentials, record.Credential)
	}
	return owner
}

// List returns the enrolled devices, newest first.
func (s *Store) List() []Record {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := append([]Record(nil), s.records...)
	sort.Slice(out, func(i, j int) bool { return out[i].AddedAt.After(out[j].AddedAt) })
	return out
}

// Len reports how many devices are enrolled.
func (s *Store) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.records)
}

// Add enrols a credential.
func (s *Store) Add(label string, credential *webauthn.Credential) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.records) >= 16 {
		return fmt.Errorf("at most 16 devices may be enrolled")
	}
	for _, existing := range s.records {
		if existing.ID() == base64.RawURLEncoding.EncodeToString(credential.ID) {
			return fmt.Errorf("this device is already enrolled")
		}
	}
	if label == "" {
		label = "device"
	}
	if len(label) > 60 {
		label = label[:60]
	}
	s.records = append(s.records, Record{
		Label: label, AddedAt: time.Now().UTC(), Credential: *credential,
	})
	return s.save()
}

// Touch records a successful sign-in and persists the credential's updated sign
// count, which is how a cloned authenticator would be detected.
func (s *Store) Touch(credential *webauthn.Credential) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := base64.RawURLEncoding.EncodeToString(credential.ID)
	for index := range s.records {
		if s.records[index].ID() == id {
			s.records[index].Credential = *credential
			s.records[index].LastUsedAt = time.Now().UTC()
			return s.save()
		}
	}
	return nil
}

// Remove deletes an enrolled device by its credential id.
func (s *Store) Remove(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for index, record := range s.records {
		if record.ID() == id {
			s.records = append(s.records[:index], s.records[index+1:]...)
			return s.save()
		}
	}
	return fmt.Errorf("no enrolled device with id %q", id)
}

// save writes the file. The caller holds the mutex.
func (s *Store) save() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	encoded, err := json.MarshalIndent(s.records, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, append(encoded, '\n'), 0o644)
}
