#!/usr/bin/env bash
# Push the current branch to the "prod" remote without the design/ folder.
#
# Git pushes whole commits, so design/ cannot simply be skipped. Instead this
# builds a commit from HEAD's tree with the excluded paths removed, parents it
# on the prod branch's current tip, and pushes that. Prod history therefore
# never contains design/, and origin (dev) history is left untouched.
#
# Only committed work is pushed, as with a normal git push.
set -euo pipefail

EXCLUDE=(design bridge)
REMOTE=prod
BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

tmp_index="$(mktemp)"
trap 'rm -f "$tmp_index"' EXIT

# Build HEAD's tree minus the excluded paths in a throwaway index.
GIT_INDEX_FILE="$tmp_index" git read-tree HEAD
GIT_INDEX_FILE="$tmp_index" git rm -r --cached --quiet --ignore-unmatch -- "${EXCLUDE[@]}"
tree="$(GIT_INDEX_FILE="$tmp_index" git write-tree)"

# Parent on the prod branch if it already exists there.
parent_args=()
if git fetch --quiet "$REMOTE" "refs/heads/$BRANCH" 2>/dev/null; then
  parent="$(git rev-parse FETCH_HEAD)"
  if [ "$(git rev-parse "$parent^{tree}")" = "$tree" ]; then
    echo "$REMOTE/$BRANCH is already up to date."
    exit 0
  fi
  parent_args=(-p "$parent")
fi

# Reuse HEAD's author and message.
export GIT_AUTHOR_NAME="$(git log -1 --format=%an HEAD)"
export GIT_AUTHOR_EMAIL="$(git log -1 --format=%ae HEAD)"
export GIT_AUTHOR_DATE="$(git log -1 --format=%aI HEAD)"
commit="$(git log -1 --format=%B HEAD | git commit-tree "$tree" ${parent_args[@]+"${parent_args[@]}"})"

git push "$REMOTE" "$commit:refs/heads/$BRANCH"
echo "Pushed $(git rev-parse --short HEAD) to $REMOTE/$BRANCH as $(git rev-parse --short "$commit") (without: ${EXCLUDE[*]})."
