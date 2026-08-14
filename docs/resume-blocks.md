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

## Requirements

`tectonic` on PATH. It fetches only the packages this document needs and caches
them; the first compile pays that once.

```bash
brew install tectonic
```
