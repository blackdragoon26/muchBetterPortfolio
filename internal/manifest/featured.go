package manifest

import (
	"encoding/json"
	"os"
	"path"
	"path/filepath"
)

// FeaturedFile is the repository-relative JSON the portfolio home page imports
// to decide which built résumé to link to. It is derived from whichever manifest
// carries Featured, never hand-edited, so the manifests stay the single source
// of truth for the choice.
const FeaturedFile = "src/generated/featured-resume.json"

// FeaturedPointer is the shape the home page reads. It deliberately carries no
// timestamp: the file is regenerated on every build, and a build-time stamp
// would make it differ on every run and commit noise even when nothing changed.
type FeaturedPointer struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Path     string `json:"path"`
	FileName string `json:"fileName"`
}

// Featured resolves the pointer for a set of manifests. It falls back to the
// first manifest when none is marked, so the home page always has a target
// rather than a broken link.
func Featured(manifests []*Manifest) (FeaturedPointer, bool) {
	var chosen *Manifest
	for _, candidate := range manifests {
		if candidate.Featured {
			chosen = candidate
			break
		}
	}
	if chosen == nil {
		if len(manifests) == 0 {
			return FeaturedPointer{}, false
		}
		chosen = manifests[0]
	}
	web := chosen.WebPath()
	return FeaturedPointer{
		ID:       chosen.ID,
		Label:    chosen.Label,
		Path:     web,
		FileName: path.Base(web),
	}, true
}

// WriteFeatured regenerates FeaturedFile from the given manifests and returns
// the absolute path it wrote, or "" when there was nothing to write. Both the
// CLI build and the builder service call this so the pointer can never drift
// from the manifest flags.
func WriteFeatured(repoRoot string, manifests []*Manifest) (string, error) {
	pointer, ok := Featured(manifests)
	if !ok {
		return "", nil
	}
	encoded, err := json.MarshalIndent(pointer, "", "  ")
	if err != nil {
		return "", err
	}
	encoded = append(encoded, '\n')

	dest := filepath.Join(repoRoot, filepath.FromSlash(FeaturedFile))
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(dest, encoded, 0o644); err != nil {
		return "", err
	}
	return dest, nil
}
