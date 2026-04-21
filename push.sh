#!/bin/bash
# Sync ~/Downloads/{index,nghiep}.html -> repo, commit, push
set -e
REPO="$HOME/hc-agency-dashboard"
DL="$HOME/Downloads"
MSG="${1:-update $(date +%Y-%m-%d\ %H:%M)}"

cd "$REPO"

# Sync files từ Downloads (nếu file tồn tại)
for f in index.html nghiep.html; do
  if [ -f "$DL/$f" ]; then
    cp "$DL/$f" "$REPO/$f"
  fi
done

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
