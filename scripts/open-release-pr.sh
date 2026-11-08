#!/usr/bin/env bash
set -euo pipefail

commit=$1
branch=$2
base=$3
title=$4
body=$5

if git merge-base --is-ancestor "$commit" "refs/remotes/origin/$base"; then
  echo "$commit is already part of $base."
  exit 0
fi

git push origin "$commit:refs/heads/$branch"

existing_pr=$(gh pr list --repo "$GITHUB_REPOSITORY" --base "$base" --head "$branch" \
  --state open --json url --jq '.[0].url // empty')
if [[ -n "$existing_pr" ]]; then
  echo "Pull request already open: $existing_pr"
  exit 0
fi

gh pr create --repo "$GITHUB_REPOSITORY" --base "$base" --head "$branch" \
  --title "$title" --body "$body"
