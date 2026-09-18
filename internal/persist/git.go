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
	if err := g.push(ctx, branch); err != nil {
		// The commit succeeded even if the push did not; report both so the
		// caller can tell the user their edit is saved but not yet shared.
		return true, err
	}
	return true, nil
}

// push sends the branch upstream, replaying local commits on top of the remote
// when it has moved on.
//
// This is the normal case here, not an edge case: CI commits rebuilt PDFs and
// synced portfolio data to the same branch several times a day, so any builder
// that has been running for a while is behind. A plain push is then rejected as
// a non-fast-forward, and the container's working copy is ephemeral — a restart
// reclones — so a commit that cannot be pushed is a commit that will be lost.
//
// Rebase rather than merge keeps the history linear, and rather than reset
// because the local commits are the edit being saved. A conflict aborts and is
// reported instead of being resolved blindly.
func (g *Git) push(ctx context.Context, branch string) error {
	if _, err := g.run(ctx, "push", "origin", branch); err == nil {
		return nil
	}
	if err := g.rebaseOnRemote(ctx, branch); err != nil {
		return fmt.Errorf("committed locally but push failed: %w", err)
	}
	if _, err := g.run(ctx, "push", "origin", branch); err != nil {
		return fmt.Errorf("committed locally but push failed after rebasing onto origin/%s: %w", branch, err)
	}
	return nil
}

// rebaseOnRemote fetches the branch and replays local commits on top of it.
func (g *Git) rebaseOnRemote(ctx context.Context, branch string) error {
	if err := g.fetch(ctx, branch); err != nil {
		return err
	}
	if _, err := g.run(ctx, "rebase", "origin/"+branch); err != nil {
		// Leave the working copy exactly as it was rather than half-rebased.
		g.run(ctx, "rebase", "--abort")
		return fmt.Errorf("local edits conflict with origin/%s and could not be replayed: %w", branch, err)
	}
	return nil
}

// fetch updates the remote branch, deepening a shallow clone first.
//
// The container clones with --depth 1, and a rebase needs the merge base: once
// the remote is more than one commit ahead, that commit is outside the shallow
// boundary and the rebase fails with no common ancestor. Deepening is skipped on
// a full clone, where --depth would make the repository shallow instead.
func (g *Git) fetch(ctx context.Context, branch string) error {
	shallow, _ := g.run(ctx, "rev-parse", "--is-shallow-repository")
	args := []string{"fetch", "origin", branch}
	if strings.TrimSpace(shallow) == "true" {
		args = []string{"fetch", "--depth=50", "origin", branch}
	}
	if _, err := g.run(ctx, args...); err != nil {
		return fmt.Errorf("fetch origin/%s: %w", branch, err)
	}
	return nil
}

// Pull fast-forwards the working copy to origin.
//
// The block store is only ever read from disk, and the process clones once at
// startup, so a running builder cannot see blocks that CI committed afterwards.
// This is how it catches up without a redeploy.
//
// It rebases rather than fast-forwarding. An earlier version refused to move
// whenever this copy held commits that were never pushed, on the grounds that a
// reset would discard them — but that left the builder wedged in exactly the
// situation it most needs to recover from: a save whose push was rejected
// because CI had committed meanwhile. Refusing kept the commit safe only until
// the next restart recloned the container and dropped it anyway. Replaying the
// local commits on top of the remote preserves them and unwedges the push.
func (g *Git) Pull(ctx context.Context) (string, error) {
	branch, err := g.Branch(ctx)
	if err != nil {
		return "", err
	}

	before, err := g.run(ctx, "rev-parse", "HEAD")
	if err != nil {
		return "", err
	}
	if err := g.rebaseOnRemote(ctx, branch); err != nil {
		return "", err
	}
	after, err := g.run(ctx, "rev-parse", "HEAD")
	if err != nil {
		return "", err
	}

	if strings.TrimSpace(before) == strings.TrimSpace(after) {
		return "already up to date", nil
	}
	return "updated to " + strings.TrimSpace(after)[:12], nil
}

// IsTracked reports whether a path is tracked in the repository. Committing a
// deletion goes through `git add`, which fails the whole commit with an
// unmatched pathspec if handed a path git has never seen; callers use this to
// decide whether a removed file is worth staging at all.
func (g *Git) IsTracked(ctx context.Context, path string) bool {
	_, err := g.run(ctx, "ls-files", "--error-unmatch", "--", path)
	return err == nil
}

// Remove deletes paths from the working tree and commits the deletion.
func (g *Git) Remove(ctx context.Context, message string, paths ...string) (bool, error) {
	if len(paths) == 0 {
		return false, nil
	}
	// --ignore-unmatch keeps this idempotent: removing something already gone is
	// not a failure worth surfacing to whoever clicked delete.
	args := append([]string{"rm", "-f", "--ignore-unmatch", "--"}, paths...)
	if _, err := g.run(ctx, args...); err != nil {
		return false, err
	}

	pathspec := append([]string{"--"}, paths...)
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
	if err := g.push(ctx, branch); err != nil {
		return true, err
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
