#!/usr/bin/env bash
# One PR: main + the PR tested locally, merged only if everything holds, then the deploy waited for and the live
# site asked. Nothing is merged on any stop. Branches are never deleted (a PR stacked on one would close).
# usage: tools/dev/concert/merge.sh <pr> [--allow-flags]
#   exit 0 merged and live · 1 stopped, nothing merged · 2 conflict with main (rebuild.sh may fix it) · 8/9 deploy
. "$(dirname "$0")/env.sh"
PR=$1; ALLOW=${2:-}
stop(){ echo "STOP #$PR: $*"; git merge --abort >/dev/null 2>&1; exit "${2:-1}"; }
worktree "$MERGE_WT" || { echo "STOP #$PR: no merge worktree"; exit 1; }
cd "$MERGE_WT" || exit 1
git merge --abort >/dev/null 2>&1; git reset -q --hard

git fetch -q origin main "+pull/$PR/head:pr$PR" || stop "fetch"
# stacked on another PR's branch: once that PR is merged, point this one at main
base=$(gh api "repos/$REPO/pulls/$PR" --jq .base.ref)
if [ "$base" != "main" ]; then
  under=$(gh api "repos/$REPO/pulls?state=all&head=${REPO%%/*}:$base" --jq '.[0] | "\(.number) \(.merged_at != null)"')
  case "$under" in *" true") gh api -X PATCH "repos/$REPO/pulls/$PR" -f base=main --jq '"  retargeted to \(.base.ref)"' || stop "retarget";;
    *) stop "stacked on $base (#${under%% *}), which is not merged yet";; esac
fi
info=$(gh pr view "$PR" -R "$REPO" --json baseRefName,mergeable,state,title --jq '"\(.state) base=\(.baseRefName) \(.mergeable) | \(.title|.[0:70])"')
echo "#$PR $info"
case "$info" in OPEN\ base=main*) ;; *) stop "not open on main";; esac

git checkout -q -B concert-test origin/main
git merge -q --no-edit "pr$PR" >/dev/null 2>&1 || stop "conflict with main: $(git diff --name-only --diff-filter=U | tr '\n' ' ')" 2
changed=$(git diff --name-only origin/main)
echo "  files: $(echo "$changed" | wc -l)"
echo "$changed" | grep -q '^package\(-lock\)\?\.json$' && npm ci --silent >/dev/null 2>&1

for i in $(seq 1 60); do   # the PR's own checks must finish and pass
  gh pr checks "$PR" -R "$REPO" 2>&1 | awk -F'\t' '{print $2}' | grep -q pending || break; sleep 20
done
checks=$(gh pr checks "$PR" -R "$REPO" 2>&1 | awk -F'\t' '{print $1": "$2}')
echo "  pr checks: $(echo "$checks" | tr '\n' ';')"
echo "$checks" | grep -q ": pending" && stop "PR checks still pending after 20 minutes"
echo "$checks" | grep -q ": fail" && stop "a PR check failed"

node tools/dev/guard.mjs > "$LOG/guard-$PR.txt" 2>&1
tail -1 "$LOG/guard-$PR.txt" | grep -q " 0 failed" || stop "guard: $(grep -E '^FAIL' "$LOG/guard-$PR.txt" | head -3 | tr '\n' ' ')"
echo "  guard: $(tail -1 "$LOG/guard-$PR.txt")"
p=$(python tools/pipeline.py --check 2>&1 | tail -1); echo "  pipeline: $p"
case "$p" in ok*) ;; *) stop "pipeline --check";; esac
npx wrangler deploy --dry-run --outdir "$LOG/dry-$PR" > "$LOG/dry-$PR.txt" 2>&1
grep -q "exiting now" "$LOG/dry-$PR.txt" || stop "wrangler dry run: $(grep -iE 'error' "$LOG/dry-$PR.txt" | head -2 | tr '\n' ' ')"
node tools/dev/dumpreport.mjs origin/main > "$LOG/dump-$PR.md" 2>&1
flags=$(sed -n '/flagged/,/^###/p' "$LOG/dump-$PR.md" | grep '^- ')
if [ -n "$flags" ]; then echo "  dump flags:"; echo "$flags" | sed 's/^/    /'; [ "$ALLOW" = "--allow-flags" ] || stop "dump report flagged"; else echo "  dump: nothing flagged"; fi

gh pr merge "$PR" -R "$REPO" --merge >/dev/null 2>&1 || stop "gh merge refused"
git fetch -q origin main; sha=$(git rev-parse --short origin/main); echo "  merged as $sha"
for i in $(seq 1 60); do
  r=$(gh api "repos/$REPO/commits/$sha/check-runs?per_page=100" --jq '.check_runs[] | select(.app.slug|test("cloudflare")) | "\(.status) \(.conclusion)"' 2>/dev/null)
  case "$r" in "completed success") echo "  deploy: ok"; exit 0;; completed*) echo "DEPLOY FAILED #$PR ($sha): $r"; exit 9;; esac
  # Cloudflare builds only when a file the site ships changed (tools/, design/, docs/ do not)
  if [ -z "$r" ] && [ "$i" -ge 18 ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/")
    echo "  deploy: none started (no site files changed); live site answers $code"; [ "$code" = 200 ] && exit 0 || exit 9
  fi
  sleep 20
done
echo "DEPLOY TIMEOUT #$PR ($sha)"; exit 8
