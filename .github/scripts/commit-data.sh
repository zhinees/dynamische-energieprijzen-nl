#!/usr/bin/env bash
# Commit and push changes under data/ (if any). Retries on push races.
set -euo pipefail
msg="$1"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add data
if git diff --cached --quiet; then
  echo "No data changes."
  exit 0
fi
git commit -m "$msg"
for i in 1 2 3; do
  if git push; then exit 0; fi
  echo "Push failed (attempt $i), rebasing..."
  git pull --rebase
done
exit 1
