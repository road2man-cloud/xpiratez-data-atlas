#!/usr/bin/env bash
# Never move/reset the caller's checkout: verification may have dirty outputs.
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
attempts=${PUBLISH_MAX_ATTEMPTS:-5}
delay=${PUBLISH_RETRY_DELAY_SECONDS:-3}
[[ $attempts =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid PUBLISH_MAX_ATTEMPTS' >&2; exit 1; }
workspace=$(mktemp -d)
worktree="$workspace/publish"
artifacts=${PUBLISH_ARTIFACT_DIR:-"$workspace/results"}
mkdir -p "$artifacts"
artifacts=$(cd "$artifacts" && pwd)
cleanup() {
  git -C "$repo" worktree remove --force "$worktree" 2>/dev/null || true
  # Leave diagnostic patches available even outside Actions.
  echo "Publication diagnostics: $artifacts"
}
trap cleanup EXIT
paths=(
  public/items/data/research-index.json
  public/items/data/research-chunks
  public/items/data/research-insight-index.json
  public/items/data/research-insight-chunks
  public/items/data/research-editorial-meta.json
  public/items/data/research-editorial-chunks
  public/items/data/item-editorial-meta.json
  public/items/data/item-editorial-chunks
)
for ((attempt=1; attempt<=attempts; attempt++)); do
  git -C "$repo" fetch origin +refs/heads/main:refs/remotes/origin/main
  base=$(git -C "$repo" rev-parse refs/remotes/origin/main)
  git -C "$repo" worktree add --detach "$worktree" "$base"
  (
    cd "$worktree"
    echo "Publication attempt $attempt/$attempts on $base"
    # Rebuild from this exact latest main, including its generators and insights.
    # Never replay stale generated JSON over another writer's changes.
    node tools/migrate-research-insight-sidecars.mjs --data public/items/data
    node tools/build-research-editorial-insights.mjs --data public/items/data --out public/items/data
    node tools/build-item-editorial-insights.mjs --data public/items/data --out public/items/data
    git add -A -- "${paths[@]}"
    git diff --cached --binary > "$artifacts/attempt-$attempt.patch"
    printf '%s\n' "$base" > "$artifacts/attempt-$attempt.base"
    node tools/check-item-research-data.mjs --data public/items/data
    node tools/check-editorial-quality.mjs --data public/items/data
    node tools/check-research-decision-insights.mjs --data public/items/data
  )
  if git -C "$worktree" diff --cached --quiet; then
    echo 'Research/item data and GPT editorials already current.'
    exit 0
  fi
  git -C "$worktree" -c user.name='github-actions[bot]' \
    -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    commit -m 'Refresh research and item GPT editorials'
  # A normal fast-forward push is the final concurrency guard (no force push).
  if git -C "$worktree" push origin HEAD:refs/heads/main; then
    exit 0
  fi
  git -C "$repo" fetch origin +refs/heads/main:refs/remotes/origin/main
  latest=$(git -C "$repo" rev-parse refs/remotes/origin/main)
  if [[ $latest == "$base" ]]; then
    echo 'Push failed without main advancing; refusing to hide a permissions/network error.' >&2
    exit 1
  fi
  echo "Main advanced to $latest; regenerating and revalidating from it."
  git -C "$repo" worktree remove --force "$worktree"
  if ((attempt < attempts)); then sleep "$delay"; fi
done
echo "Main kept advancing; exhausted $attempts publication attempts. Patches are preserved." >&2
exit 1
