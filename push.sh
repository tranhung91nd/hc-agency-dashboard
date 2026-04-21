#!/bin/bash
# Sync ~/Downloads/index.html -> repo, commit, push
set -e
REPO="$HOME/hc-agency-dashboard"
SRC="$HOME/Downloads/index.html"
MSG="${1:-update $(date +%Y-%m-%d\ %H:%M)}"

cd "$REPO"

# Sync file từ Downloads (nếu có thay đổi)
if [ -f "$SRC" ]; then
  cp "$SRC" "$REPO/index.html"
fi

# Nếu không có thay đổi → thoát
if git diff --quiet && git diff --cached --quiet; then
  echo "✓ Không có thay đổi để push."
  exit 0
fi

git add -A
git commit -m "$MSG"
git push

echo ""
echo "✓ Đã push: $MSG"
echo "  → https://github.com/tranhung91nd/hc-agency-dashboard"
