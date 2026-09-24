#!/usr/bin/env bash
# Commit and push changes under data/ (if any). Retries on push races.
set -euo pipefail
bericht="$1"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add data
if git diff --cached --quiet; then
  echo "Geen wijzigingen in de data."
  exit 0
fi
git commit -m "$bericht"
for i in 1 2 3; do
  if git push; then exit 0; fi
  echo "Pushen mislukt (poging $i), opnieuw rebasen..."
  git pull --rebase
done
exit 1
