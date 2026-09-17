# Résumé blocks

One block library, many résumés. A block is written once and reused; a résumé is
an ordered selection of blocks, not a document.

## Why

The old pipeline produced exactly one PDF. Anything else meant hand-editing
LaTeX, which is why the previous generator carried a hardcoded PR exclusion list,
a hardcoded ordering map, and a literal `\hspace*{1.5em}` nudge to make one line
fit. Those were per-résumé decisions living in code.

## Layout

```text
data/blocks/<kind>/*.yaml    the library — one block per file
resumes/*.yaml               one manifest per résumé
internal/block               store, variants, three-way resolution
internal/render              LaTeX templates and escaping
internal/compile             tectonic, page count, overfull boxes
cmd/importer                 refreshes machine facts from portfolio.json
cmd/resumekit                CLI: build / list / tex
cmd/resumed                  the builder service
```

## A block

```yaml
id: project:xnic-v1
kind: project
tags: [systems, kernel, hardware]

machine:            # imported from GitHub; replaced on every sync
  stars: 1
  repositoryUrl: https://github.com/blackdragoon26/xnic-v1

content:            # written by a human; the importer never touches this
  title: XNIC v1
  objective: ...

variants:           # named overlays, reusable from any résumé
  tight: { objective: ... }
```

`machine` and `content` are separate maps so a nightly sync **cannot** overwrite
authored prose. There is no field-level rule to get wrong.

## A résumé

```yaml
id: hardware
output: public/resume/Sankalp-Jha-Hardware.pdf
maxPages: 1
sections:
  - heading: Key Projects
    blocks:
      - block: project:xnic-v1
        variant: tight
        override:                    # this résumé only
          impact: ...
```

## Three ways to save an edit

Resolution layers `machine → content → variant → override`, later winning.
That gives three scopes:

| Scope | Written to | Affects |
| --- | --- | --- |
| Only this résumé | `override:` in the manifest | one PDF |
| Named variant | a new key under `variants:` | any résumé that opts in |
| Update everywhere | `content:` on the block | every résumé that hasn't overridden it |

Because blocks are files in git, every promotion is a commit — diffable and
revertible.

## Commands

```bash
go run ./cmd/resumekit build          # compile every résumé
go run ./cmd/resumekit build hardware # just one
go run ./cmd/resumekit tex hardware   # print the LaTeX, don't compile
go run ./cmd/resumekit list           # the block library
go run ./cmd/importer                 # refresh machine facts
```

Building reports page counts against `maxPages` and, when a résumé is over,
ranks the variant swaps that would shorten it:

```text
systems  2 page(s)  OVER
    shorter variants available (by characters saved):
      -497   project:xnic-v1   bullets -> tight
      -253   contribution:wasmedge-wasmedge   narrative -> headline
```

Only variants that actually render shorter are offered — each candidate is
rendered and measured.

## The builder

```bash
go run ./cmd/resumekit totp            # once: prints a key to enrol
RESUMEKIT_TOTP_SECRET=<key> go run ./cmd/resumed
```

Login is a six-digit code from an authenticator app, rate-limited and
single-use.

Drag blocks between sections, pick variants, edit content with the three-way
save, live PDF preview. Deployment notes are in
[myprod-handoff.md](myprod-handoff.md).

## Raw LaTeX résumés

Sometimes a version needs a tweak the blocks cannot express — a bespoke command,
hand-tuned spacing, a one-off layout. Any résumé can be switched to a hand-edited
LaTeX document instead of a selection of blocks.

In the builder, the **TeX** button converts the open résumé: the LaTeX generated
from its current blocks becomes the starting point, the middle column turns into
a source editor, and the preview compiles exactly what you type. **Save** writes
the source to a sidecar file beside the manifest and marks the manifest raw:

```text
resumes/<id>.yaml     raw: true
resumes/<id>.tex      the hand-written source
```

Both are committed together, so a raw version is still a reviewable diff. A raw
résumé no longer auto-updates from block or PR changes — it is frozen prose. The
**Blocks** button reverts it: the sidecar is removed and the manifest compiles
from its blocks again. The blocks are always intact, so switching back is safe —
but any edits made to the LaTeX itself live only in that sidecar and are
discarded on revert. Copy the source out first if you want to keep it. (Because
it is committed, a discarded sidecar is still recoverable from git history.)

`resumekit build` compiles a raw résumé straight from its sidecar; everything
downstream (page-budget check, PDF output path) is unchanged.

### What raw LaTeX may not do

tectonic runs with shell-escape off, so `\write18` cannot execute commands. On
top of that the builder refuses source that reads a file outside the compile —
`\input`, `\include`, `\openin`, `\includegraphics` and friends pointing at an
absolute path, a parent directory (`..`) or a pipe are rejected before anything
compiles. It is a guardrail against accidentally pulling a secret into a PDF, not
a sandbox; the only person who can submit LaTeX is the authenticated owner.

## The featured résumé

The portfolio home page links to one résumé. That choice is a flag on a
manifest:

```yaml
featured: true
```

Exactly one manifest should carry it. The builder's ☆ button enforces that from
the UI — it moves the flag to the open résumé and clears it from the rest —
but nothing validates hand-edited YAML, so if you set the flag by hand keep it on
a single file. When the invariant is broken, the derivation is still
deterministic rather than arbitrary: `resumekit` picks the first flagged manifest
in id order, or the first manifest of all when none is flagged. `resumekit build`
derives `src/generated/featured-resume.json` from that choice, and the home
page's résumé section imports the pointer for its View / Download links, filename
and label — so featuring a different version is a one-click change that
ships on the next build.

## Requirements

`tectonic` on PATH. It fetches only the packages this document needs and caches
them; the first compile pays that once.

```bash
brew install tectonic
```
