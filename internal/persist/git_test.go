package persist

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	command := exec.Command("git", args...)
	command.Dir = dir
	command.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=test", "GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=test", "GIT_COMMITTER_EMAIL=test@example.com")
	out, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return string(out)
}

// origin, a full clone standing in for CI, and a --depth 1 clone standing in for
// the builder container.
func scaffold(t *testing.T) (origin, ci, builder string) {
	t.Helper()
	root := t.TempDir()
	origin = filepath.Join(root, "origin.git")
	git(t, root, "init", "--bare", "--initial-branch=main", origin)

	ci = filepath.Join(root, "ci")
	git(t, root, "clone", "file://"+origin, ci)
	if err := os.WriteFile(filepath.Join(ci, "seed.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git(t, ci, "add", "-A")
	git(t, ci, "commit", "-m", "seed")
	git(t, ci, "push", "origin", "main")

	builder = filepath.Join(root, "builder")
	// Shallow, exactly as docker-entrypoint.sh clones it.
	git(t, root, "clone", "--depth", "1", "--branch", "main", "file://"+origin, builder)
	return origin, ci, builder
}

// The failure this reproduces: CI commits to main while the builder holds an
// unpushed commit of its own. The push is rejected as a non-fast-forward, and
// because the container's working copy is discarded on restart, a commit that
// cannot be pushed is a commit that is lost.
func TestCommitPushesAfterRemoteMovedAhead(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	_, ci, builder := scaffold(t)

	// CI pushes several commits, putting the merge base outside the builder's
	// shallow boundary.
	for _, name := range []string{"rebuild-1", "rebuild-2", "rebuild-3"} {
		if err := os.WriteFile(filepath.Join(ci, name+".pdf"), []byte(name), 0o644); err != nil {
			t.Fatal(err)
		}
		git(t, ci, "add", "-A")
		git(t, ci, "commit", "-m", "chore: "+name)
	}
	git(t, ci, "push", "origin", "main")

	// The builder saves an edit of its own.
	edit := filepath.Join(builder, "resume.yaml")
	if err := os.WriteFile(edit, []byte("id: swe-japanese\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	repository := &Git{Dir: builder, AuthorName: "builder", AuthorEmail: "builder@example.com", Push: true}
	committed, err := repository.Commit(context.Background(), "resume(swe-japanese): save", edit)
	if err != nil {
		t.Fatalf("Commit returned an error, so the edit would be lost on restart: %v", err)
	}
	if !committed {
		t.Fatal("Commit reported nothing to commit")
	}

	// The edit must be on the remote, and CI's commits must have survived it.
	git(t, ci, "fetch", "origin", "main")
	log := git(t, ci, "log", "--format=%s", "origin/main")
	for _, want := range []string{"resume(swe-japanese): save", "chore: rebuild-3", "chore: rebuild-1"} {
		if !strings.Contains(log, want) {
			t.Errorf("origin/main is missing %q after the rebase; log:\n%s", want, log)
		}
	}
}

// Refresh has to recover the same situation, rather than refusing to move
// because the copy holds commits that were never pushed.
func TestPullRebasesLocalCommits(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	_, ci, builder := scaffold(t)

	if err := os.WriteFile(filepath.Join(ci, "upstream.txt"), []byte("ci\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git(t, ci, "add", "-A")
	git(t, ci, "commit", "-m", "chore: sync")
	git(t, ci, "push", "origin", "main")

	// A local commit that was never pushed — the wedged state.
	local := filepath.Join(builder, "local.yaml")
	if err := os.WriteFile(local, []byte("local\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	repository := &Git{Dir: builder, AuthorName: "builder", AuthorEmail: "builder@example.com"}
	if _, err := repository.Commit(context.Background(), "resume: local only", local); err != nil {
		t.Fatal(err)
	}

	if _, err := repository.Pull(context.Background()); err != nil {
		t.Fatalf("Pull refused to recover a copy with unpushed commits: %v", err)
	}
	log := git(t, builder, "log", "--format=%s")
	for _, want := range []string{"resume: local only", "chore: sync"} {
		if !strings.Contains(log, want) {
			t.Errorf("after Pull the history is missing %q; log:\n%s", want, log)
		}
	}
}
