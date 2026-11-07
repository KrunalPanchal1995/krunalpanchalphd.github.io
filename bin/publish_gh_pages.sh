#!/usr/bin/env bash
# Publish the locally built site (_site/) to the gh-pages branch as a FAST-FORWARD commit, then wait
# for the GitHub Pages build and fail loudly if it errors.
#
# Why this script exists (2026-11-07 incident): the first publish was a fresh `git init` of _site pushed
# normally and built fine. Re-publishing the same site by *force-pushing a new root commit* made every
# following Pages build fail instantly ("Page build failed", duration 0 ms, no further detail), even for
# an identical tree. Force-pushing the original commit back recovered the branch, and the same full tree
# built fine as an ordinary commit on top of it. So: never replace gh-pages history. Always clone the
# existing branch, copy the new build over it, commit, and push without -f. A non-fast-forward push is
# rejected on purpose; if that ever happens, stop and look instead of forcing.
#
# Usage (from the repo root, after a production build):
#   JEKYLL_ENV=production bundle exec jekyll build
#   python3 <path>/check_site_links.py _site /krunalpanchalphd.github.io     # optional but recommended
#   bin/publish_gh_pages.sh
set -euo pipefail

SLUG="${REPO_SLUG:-KrunalPanchal1995/krunalpanchalphd.github.io}"
SITE_DIR="${SITE_DIR:-_site}"
GIT_NAME="${GIT_NAME:-KrunalPanchal1995}"
GIT_EMAIL="${GIT_EMAIL:-44561711+KrunalPanchal1995@users.noreply.github.com}"
TIMEOUT_S="${TIMEOUT_S:-300}"

[ -f "$SITE_DIR/index.html" ] || { echo "No built site in $SITE_DIR (build first)." >&2; exit 1; }
SRC_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Cloning existing gh-pages history from $SLUG ..."
git clone --quiet --branch gh-pages --single-branch "https://github.com/$SLUG.git" "$WORK"

# Mirror the build into the clone (removes stale files such as old hashed bundles; keeps .git).
rsync -a --delete --exclude=.git "$SITE_DIR"/ "$WORK"/
touch "$WORK/.nojekyll"

cd "$WORK"
git add -A
if git diff --cached --quiet; then
  echo "Nothing to publish: gh-pages already matches $SITE_DIR."
  exit 0
fi
git -c user.name="$GIT_NAME" -c user.email="$GIT_EMAIL" commit --quiet -m "Publish built site (source $SRC_SHA)"
NEW="$(git rev-parse HEAD)"
echo "Pushing $NEW (fast-forward only) ..."
git push --quiet origin HEAD:gh-pages   # deliberately NO --force

echo "Waiting for the Pages build (up to ${TIMEOUT_S}s) ..."
deadline=$((SECONDS + TIMEOUT_S))
while [ "$SECONDS" -lt "$deadline" ]; do
  sleep 8
  read -r status commit < <(gh api "repos/$SLUG/pages/builds/latest" --jq '"\(.status) \(.commit)"')
  if [ "$commit" = "$NEW" ] && [ "$status" = "built" ]; then
    echo "Built. Live: $(echo "https://${SLUG%%/*}.github.io/${SLUG#*/}/" | tr '[:upper:]' '[:lower:]')"
    exit 0
  fi
  if [ "$commit" = "$NEW" ] && [ "$status" = "errored" ]; then
    echo "Pages build ERRORED for $NEW." >&2
    echo "Do NOT force-push. Check: gh api repos/$SLUG/pages/builds/latest ; file sizes (<100 MB each) ; GitHub status." >&2
    exit 2
  fi
done
echo "Timed out waiting for the Pages build of $NEW." >&2
exit 3
