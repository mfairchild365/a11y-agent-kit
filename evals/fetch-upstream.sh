#!/usr/bin/env bash
# Fetches a pinned slice of microsoft/a11y-llm-eval (node_runner + test_cases)
# for reuse as a second, more rigorous grading layer. Nothing here is copied
# into this repo; it's a plain tarball of a fixed commit, extracted next to
# this script and refreshed only when this script is re-run (or the pin
# below changes). See evals/README.md for how to bump the pin.
#
# This downloads a GitHub tarball instead of `git clone`-ing, because a
# nested `.git` directory under a checkout of *this* repo can trip up
# tooling (and some sandboxes) that guard against nested git repos.
set -euo pipefail

UPSTREAM_REPO="microsoft/a11y-llm-eval"
UPSTREAM_SHA="f6ac724b119d6f65e28177a16e0b5dde1f0654f8"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$SCRIPT_DIR/.upstream/a11y-llm-eval"
PIN_FILE="$DEST/.pinned-sha"

if [ -f "$PIN_FILE" ] && [ "$(cat "$PIN_FILE")" = "$UPSTREAM_SHA" ]; then
  echo "evals/.upstream/a11y-llm-eval already at $UPSTREAM_SHA"
  exit 0
fi

rm -rf "$DEST"
mkdir -p "$DEST"

TARBALL="$(mktemp "${TMPDIR:-/tmp}/a11y-llm-eval-upstream.XXXXXX.tar.gz")"
trap 'rm -f "$TARBALL"' EXIT

echo "Downloading $UPSTREAM_REPO @ $UPSTREAM_SHA ..."
curl -sSfL -o "$TARBALL" "https://codeload.github.com/$UPSTREAM_REPO/tar.gz/$UPSTREAM_SHA"

# The tarball's top-level dir is "<repo>-<sha>/"; keep only what we need.
tar -xzf "$TARBALL" -C "$DEST" --strip-components=1 \
  --include='*/node_runner/*' --include='*/test_cases/*'

echo "$UPSTREAM_SHA" > "$PIN_FILE"

echo "Installing node_runner dependencies..."
# --cache points at a scratch dir rather than the user's default npm cache:
# on some machines that cache has root-owned files left over from an old
# npm bug, which makes a plain `npm ci` fail with EPERM. Isolating the
# cache here sidesteps that without needing `sudo chown` on the user's machine.
npm ci --silent --cache "${TMPDIR:-/tmp}/a11y-llm-eval-npm-cache" --prefix "$DEST/node_runner"

echo "Fetched a11y-llm-eval @ $UPSTREAM_SHA into $DEST"
