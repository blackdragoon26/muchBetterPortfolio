// Package persist commits block and manifest edits back to the repository.
//
// The block store is plain YAML under version control, so the repository is the
// database. Saving from the builder therefore means committing and pushing:
// that is what makes an edit made from a phone visible to the next CI run, and
// it means every content change arrives with an author, a timestamp and a diff
// rather than as an opaque mutation.
package persist

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Git runs git commands against a working tree.
type Git struct {
	Dir string

	// Author identifies commits made by the builder.
	AuthorName  string
	AuthorEmail string

	// Push controls whether commits are sent upstream. Running locally without
	// a token, committing alone is the useful behaviour.
	Push bool
}

// Status reports whether the working tree has uncommitted changes.
func (g *Git) Status(ctx context.Context) (string, error) {
	return g.run(ctx, "status", "--short")
}

// Branch returns the current branch name.
func (g *Git) Branch(ctx context.Context) (string, error) {
	branch, err := g.run(ctx, "rev-parse", "--abbrev-ref", "HEAD")
	return strings.TrimSpace(branch), err
}

// Commit stages the given paths and commits them. It returns false when there
// was nothing to commit, which is the common case for a save that changed
// nothing, and is not an error.
func (g *Git) Commit(ctx context.Context, message string, paths ...string) (bool, error) {
	if len(paths) == 0 {
		return false, nil
	}
	if _, err := g.run(ctx, append([]string{"add", "--"}, paths...)...); err != nil {
		return false, err
	}

	// Every git call below is scoped to these paths. Without the pathspec,
	// `diff --cached` and `commit` inspect the whole index, so an editor save
	// would sweep up any unrelated staged change sitting in the working tree
	// and attribute it to this commit.
	pathspec := append([]string{"--"}, paths...)

	// --quiet exits non-zero when the index differs from HEAD, so a plain error
	// here means "there are staged changes", not a failure.
	diffArgs := append([]string{"diff", "--cached", "--quiet"}, pathspec...)
	if _, err := g.run(ctx, diffArgs...); err == nil {
		return false, nil
	}

	author := fmt.Sprintf("%s <%s>", g.AuthorName, g.AuthorEmail)
	commitArgs := append([]string{"commit", "--author", author, "-m", message}, pathspec...)
	if _, err := g.run(ctx, commitArgs...); err != nil {
		return false, err
	}
	if !g.Push {
		return true, nil
	}

	branch, err := g.Branch(ctx)
	if err != nil {
		return true, err
	}
	if _, err := g.run(ctx, "push", "origin", branch); err != nil {
		// The commit succeeded even if the push did not; report both so the
		// caller can tell the user their edit is saved but not yet shared.
		return true, fmt.Errorf("committed locally but push failed: %w", err)
	}
	return true, nil
}

func (g *Git) run(ctx context.Context, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	command := exec.CommandContext(ctx, "git", args...)
	command.Dir = g.Dir
	var out, errOut bytes.Buffer
	command.Stdout = &out
	command.Stderr = &errOut
	if err := command.Run(); err != nil {
		return out.String(), fmt.Errorf("git %s: %w: %s",
			strings.Join(args, " "), err, strings.TrimSpace(errOut.String()))
	}
	return out.String(), nil
}
