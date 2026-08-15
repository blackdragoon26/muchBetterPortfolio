package passkey

import (
	"crypto/rand"
	"encoding/base64"
)

// randomToken names one in-flight ceremony. It is not a credential: it only
// ties the second half of a ceremony to the challenge issued by the first, and
// it is discarded on use.
func randomToken() string {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		// crypto/rand failing means the process cannot do anything safely.
		panic("passkey: no entropy available: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

func base64ID(id []byte) string {
	return base64.RawURLEncoding.EncodeToString(id)
}
