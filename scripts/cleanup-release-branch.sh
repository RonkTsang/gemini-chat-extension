#!/usr/bin/env bash
set -euo pipefail

branch=$1
commit=$2
base=$3
pr_number=$4

case "$base" in
  stable) [[ "$branch" = "release/candidate-$commit" ]] ;;
  main) [[ "$branch" =~ ^release/sync-v[0-9]+\.[0-9]+\.[0-9]+$ ]] ;;
  *) exit 1 ;;
esac
[[ "$commit" =~ ^[0-9a-f]{40}$ && "$pr_number" =~ ^[0-9]+$ ]]

# The sync PR can take a few seconds to be marked merged after the push to main.
for attempt in 1 2 3 4 5 6; do
  pr=$(gh api "repos/$GITHUB_REPOSITORY/pulls/$pr_number")
  if jq -e --arg branch "$branch" --arg commit "$commit" --arg base "$base" \
    --arg repo "$GITHUB_REPOSITORY" '
      .merged and .base.ref == $base and .head.ref == $branch
      and .head.sha == $commit and .head.repo.full_name == $repo
    ' <<< "$pr" > /dev/null; then
    ref="refs/heads/$branch"
    remote_ref=$(git ls-remote origin "$ref")
    if [[ -z "$remote_ref" ]]; then
      echo "$branch has already been deleted."
      exit 0
    fi
    # Delete only the exact ref that was merged, even if it moves during cleanup.
    git push --force-with-lease="$ref:$commit" origin ":$ref"
    exit 0
  fi
  if [[ "$attempt" != 6 ]]; then sleep 2; fi
done

echo "::warning::Could not confirm PR #$pr_number merged $branch. The branch was kept."
