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

Blocks in the palette are colour-coded by kind, and any block the importer does
not own — anything authored by hand rather than synced from GitHub or the
profile README — is marked `custom`, so it is obvious which ones a nightly sync
will rewrite and which are yours.

The `⋯` menu holds the rest: rename a résumé (its display name and page budget;
the id and PDF path stay fixed so existing links keep working), duplicate one
— including its hand-edited LaTeX, if it has any — and author a new block.

## Adding a block from the builder

**New block…** writes a new file into the library under its kind, with
`source: manual` so the importer leaves it alone for good. It is a library
addition, not a résumé one: the moment it is created it appears in *Available
blocks* for **every** résumé, ready to drag in.

The kinds offered are the ones a library grows by — `project`, `experience`,
`contribution`, `publication`. The others (`education`, `skills`, `header`,
`leadership`, `certificates`) are single blocks that already exist and are
edited in place rather than duplicated.

## Why a merged pull request isn't on the résumé

Two different lists are at work, and this trips people up:

- `machine.pullRequests` — **every** merged PR for a repository, refreshed by the
  nightly importer.
- `content.entries` — the ones this résumé actually prints.

The importer deliberately never adds to the second. Which PRs are worth showing
is an editorial call, and a nightly job silently lengthening every résumé would
be worse than useless. So a freshly merged PR lands in the block file but stays
off the page until it is chosen — the importer (`go run ./cmd/importer`) prints
the ones waiting.

Choose them in the builder: open a contribution block with ✎ and every imported
PR is listed with a tick box, newest first, with the merge date and a summary
field (leave it blank to use the PR title). Ticking one writes it into
`content.entries` through the same three-way save, so it can apply to one résumé,
to a named variant, or to every résumé at once.

## Raw LaTeX résumés

Sometimes a version needs a tweak the blocks cannot express — a bespoke command,
hand-tuned spacing, a one-off layout. Any résumé can be switched to a hand-edited
LaTeX document instead of a selection of blocks.

In the builder, the **Edit LaTeX** button converts the open résumé: the LaTeX
generated from its current blocks becomes the starting point, the middle column
turns into a source editor, and the preview compiles exactly what you type.
**Save** writes the source to a sidecar file beside the manifest and marks the
manifest raw:

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

**Edit LaTeX is not the same as the LaTeX source button.** *LaTeX source* is a
read-only export: it shows the generated document so it can be copied into
Overleaf or filed next to the PDF, and anything done to that copy happens outside
this repository and never reaches the built résumé. *Edit LaTeX* changes what the
résumé compiles from — the source is stored, committed, rebuilt by CI, and
becomes the PDF the site serves.

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
