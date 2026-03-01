package sqliteapi

import (
	"crypto/rand"
	"encoding/hex"
)

func newID(prefix string) string {
	var random [8]byte
	if _, err := rand.Read(random[:]); err != nil {
		return prefix + "-fallback"
	}
	return prefix + "-" + hex.EncodeToString(random[:])
}
