#!/bin/bash
# Sitters4Me — sync local changes to GitHub
# Run this in Terminal after each Claude session:
#   bash ~/sitters4me/sync.sh
# Or make it executable once with: chmod +x ~/sitters4me/sync.sh
# Then just run: ~/sitters4me/sync.sh

set -e
cd "$(dirname "$0")"

# Remove stale lock if it exists
rm -f .git/index.lock

# Stage everything
git add -A

# Check if there's anything to commit
if git diff --cached --quiet; then
  echo "✅ Nothing to commit — already up to date."
  exit 0
fi

# Build commit message from changed files
CHANGED=$(git diff --cached --name-only | head -20 | tr '\n' ', ' | sed 's/,$//')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

git commit -m "Update: $TIMESTAMP

Files changed: $CHANGED"

# Push
git push origin main

echo ""
echo "✅ Pushed to https://github.com/yinkastihl/Sitters4Me"
