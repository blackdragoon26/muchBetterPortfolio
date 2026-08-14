#!/bin/sh
# Prepares the working copy, then starts the builder.
#
# The container keeps no durable state: the block store and the résumé manifests
# live in git, so every start takes a fresh shallow clone. Saves in the builder
# commit and push back, which is what makes an edit made from a phone survive the
# allocation being replaced.
set -eu

REPO_DIR="${RESUMEKIT_REPO:-/data/repo}"
REPO_URL="${RESUMEKIT_REPO_URL:-https://github.com/blackdragoon26/muchBetterPortfolio.git}"
BRANCH="${RESUMEKIT_REPO_BRANCH:-main}"

# Myprod mounts the operator-installed secret file read-only. Load it before
# anything reads a token; the values never pass through the dashboard.
for candidate in /run/secrets/resume-builder.env /run/secrets/cutable.env; do
  if [ -f "$candidate" ]; then
    echo "entrypoint: loading secrets from $candidate"
    set -a
    # shellcheck disable=SC1090
    . "$candidate"
    set +a
    break
  fi
done

if [ -z "${RESUMEKIT_TOTP_SECRET:-}" ]; then
  echo "entrypoint: RESUMEKIT_TOTP_SECRET is not set; refusing to start an unauthenticated editor" >&2
  echo "entrypoint: generate one with 'resumekit totp' and add it to the runtime env file" >&2
  exit 1
fi

# A token in the remote URL would end up in .git/config and in any error output,
# so it is supplied through a credential helper that only echoes it to git.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  git config --global credential.helper \
    '!f() { echo "username=x-access-token"; echo "password=${GITHUB_TOKEN}"; }; f'
  export RESUMEKIT_GIT_PUSH=true
else
  echo "entrypoint: GITHUB_TOKEN not set; edits will commit locally but not push"
fi

git config --global --add safe.directory "$REPO_DIR"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "entrypoint: cloning $BRANCH"
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
elif [ "${RESUMEKIT_REPO_REFRESH:-true}" = "true" ]; then
  # Discards anything not pushed. Correct for an ephemeral allocation, where the
  # working copy is a cache of origin and nothing else. Set
  # RESUMEKIT_REPO_REFRESH=false when pointing the container at a working tree
  # you care about, such as a bind mount during local development.
  echo "entrypoint: refreshing $BRANCH (discarding local state)"
  git -C "$REPO_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
else
  echo "entrypoint: reusing the existing working copy without refreshing"
fi

# Committing needs an identity even when pushing is disabled.
git -C "$REPO_DIR" config user.name "${RESUMEKIT_GIT_NAME:-resume-builder[bot]}"
git -C "$REPO_DIR" config user.email "${RESUMEKIT_GIT_EMAIL:-resume-builder@users.noreply.github.com}"

exec /usr/local/bin/resumed
