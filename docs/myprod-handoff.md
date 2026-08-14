# Myprod Handoff — resume-builder

Prepared against the contract in
[Myprod docs/application-onboarding.md](https://github.com/blackdragoon26/Myprod/blob/main/docs/application-onboarding.md).

Nothing in Myprod, Oracle, Nomad, WireGuard, Traefik or any cloud firewall was
changed while preparing this. Registration and deployment remain operator
actions.

## Handoff manifest

```txt
name: resume-builder
source commit: <filled in by the publish workflow>
image: ghcr.io/blackdragoon26/resume-builder:<commit-sha>
image digest: <recorded in the workflow run summary>
architecture: linux/arm64 (linux/amd64 also published)
container port: 8080
health path: /healthz
recommended CPU MHz: 1000
recommended memory MB: 512
ephemeral data behavior: the working copy under /data/repo is a shallow clone
  discarded on restart; every saved edit is committed and pushed to GitHub, so no
  application data lives on the node. Preview PDFs are held in memory, capped at
  24, and lost on restart.
required environment variables: RESUMEKIT_REPO_URL, RESUMEKIT_REPO_BRANCH
  (both have working defaults baked into the image)
required secrets: RESUMEKIT_TOTP_SECRET (editor login), GITHUB_TOKEN (push access)
publicly pullable without authentication: yes, once the GHCR package is marked public
local container smoke command: see below
health-check result: {"status":"ok"} with HTTP 200
project test command and result: go test ./... — ok (block, render)
known limitations: see below
```

## Verified locally

Built for `linux/arm64` and run as a non-root container on an Apple Silicon host,
which is the same architecture as the Oracle control plane.

```sh
docker buildx build --platform linux/arm64 -t resumed:test --load .
docker run -d --name resumedtest -p 8100:8080 \
  -e RESUMEKIT_TOKEN=<token> \
  -e RESUMEKIT_REPO_REFRESH=false \
  -v "$PWD:/data/repo" resumed:test
curl -s http://127.0.0.1:8100/healthz
```

Observed:

| Check | Result |
| --- | --- |
| `uname -m` in container | `aarch64` |
| Process user | `uid=65532(nonroot) gid=65532(nonroot)` |
| `/healthz` | `{"status":"ok"}`, HTTP 200, no auth, no mutation |
| Docker HEALTHCHECK | `healthy` |
| First compile in a cold container | 6.2 s |
| Subsequent compile | 1.56 s |
| tectonic downloads at runtime | 0 — the support-file cache is baked into the image |
| Image size | 443 MB (45 MB of that is the LaTeX cache) |
| Unauthenticated `/api/state` | HTTP 401 |
| Wrong login token | HTTP 401 |
| Request body over 1 MB | HTTP 400 |
| Path traversal on `/api/resume/{id}` | HTTP 400 |

## Bounds

Per contract item 5, public traffic is bounded:

- Request bodies are capped at 1 MB.
- Exactly one LaTeX compile runs at a time. A second concurrent request is
  refused with HTTP 429 rather than queued, so load cannot accumulate.
- Each compile runs in its own scratch directory, so concurrent requests can
  never read each other's artifacts.
- Each compile is cancelled after 60 s.
- Generated PDFs are held in memory only, capped at 24, roughly 50 KB each.
- All repository writes are serialised behind one mutex, so overlapping saves
  cannot collide on `index.lock` or commit a partial set of files.
- Commits are scoped to the paths the request touched, so an editor save never
  sweeps up unrelated staged changes.
- `Manifest.Output` is validated to a relative `.pdf` path under
  `public/resume/`, so a manifest cannot direct a write outside the repository.
- Login is a six-digit TOTP code. Five wrong codes lock logins for five
  minutes, and attempts made while locked restart that window, so guessing
  cannot simply be waited out. A correct code is single-use: replaying one
  inside its validity window is refused.
- Every route except `/healthz` and `/` requires a session or the API token.

## Secrets

The service needs two values and reads them from the operator-installed runtime
environment file, so neither passes through the dashboard or the agent store.

Install on the target node as `/etc/poolctl/apps/resume-builder.env`, owner
`65532:65532`, mode `0400`:

```sh
RESUMEKIT_TOTP_SECRET=<base32 key from `resumekit totp`>
GITHUB_TOKEN=<a fine-grained PAT with contents:write on muchBetterPortfolio only>
```

Generate the first with `resumekit totp`, which prints the key, an `otpauth://`
URI, and the code your app should currently be showing so enrolment can be
checked before it is relied on.

`RESUMEKIT_TOKEN` is now optional and grants API access to scripts only. Leave
it unset and the one-time code becomes the sole way in.

Register the app with `secret_env: true`. The entrypoint also accepts the file at
`/run/secrets/resume-builder.env`.

Without `GITHUB_TOKEN` the service still runs: edits commit inside the container
and are lost on restart. That is a safe way to try it before issuing a token.
Without `RESUMEKIT_TOTP_SECRET` it refuses to start, rather than exposing an
editor that can rewrite the résumé and push to the repository.

## Continuous deployment

Pushing to `main` builds the image and rolls it out without a manual step. The
publish workflow calls the agent's scoped image endpoint, which updates the
registration and redeploys in one request:

```txt
POST https://api.sankalpjha.dev/__poolctl/api/apps/resume-builder/image
Authorization: Bearer <scoped deploy token>
{"image": "ghcr.io/blackdragoon26/resume-builder@sha256:..."}
```

Two properties make this safe to hand to CI. The token is scoped to this app
alone, so it cannot touch any other deployment, and the agent rejects any image
that is not an immutable `sha256` digest in the repository the app is already
registered against — a leaked token cannot repoint the service at an arbitrary
image.

A 200 only means the job was submitted, so the workflow then polls `/healthz`
for five minutes. A release that crash-loops fails the workflow rather than
being reported as a successful deploy.

To enable it:

1. Generate a token of at least 32 characters: `openssl rand -hex 24`.
2. Add it to the agent's environment on the Oracle node, then restart the agent:

   ```sh
   POOLCTL_APP_DEPLOY_TOKENS_JSON='{"resume-builder":"<token>"}'
   ```

   The variable is a JSON object, so merge rather than replace it if other apps
   already have scoped tokens.
3. In this repository: add secret `MYPROD_DEPLOY_TOKEN` with the same value, and
   variable `MYPROD_AGENT_URL` set to `https://api.sankalpjha.dev`.

The deploy step is skipped when `MYPROD_AGENT_URL` is unset, so the workflow
still builds and publishes before any of this is configured.

## Suggested registration values

```txt
name:           resume-builder
image:          ghcr.io/blackdragoon26/resume-builder:<commit-sha>
domain:         resume.sankalpjha.dev
target node:    oracle-main
container port: 8080
health path:    /healthz
CPU:            1000 MHz
memory:         512 MB
DNS:            managed (A record -> 140.245.5.201)
secret_env:     true
```

## Known limitations

- **Single writer.** Two people editing at once will produce conflicting commits;
  the second push fails and the error surfaces in the UI. This is a personal
  tool, so it is not worth solving yet.
- **No persistent volume.** Deliberate — the git remote is the durable store.
- **Push failures are reported, not retried.** A save that commits but cannot
  push says so explicitly rather than pretending to have succeeded.
- **The editor edits scalar and string-list fields.** Nested structures such as
  education rows and skill groups are edited in YAML, where the shape is visible.
- **`resume.sankalpjha.dev` will serve an authenticated editor**, not public
  content. The published résumé PDFs remain static files on the portfolio site.
