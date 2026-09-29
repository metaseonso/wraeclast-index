#!/usr/bin/env bash
# A PR that clashes with main only in built data: main merged into its branch, main's built data taken, the data
# built again from the PR's code (pipeline --from sync), every check run. Pushes nothing (ship.sh pushes).
# A clash in code stops it: resolve that by hand in the fix worktree, commit the merge, then run it again with
# CONCERT_MERGED=1, which starts from the merge already made.
# usage: tools/dev/concert/rebuild.sh <pr>    exit 0 = rebuilt and checked, on branch fix<pr> in the fix worktree
. "$(dirname "$0")/env.sh"
PR=$1
stop(){ echo "STOP rebuild #$PR: $*"; exit 1; }
take_main(){ if git cat-file -e origin/main:"$1" 2>/dev/null; then git checkout -q origin/main -- "$1"; else git rm -q -f "$1"; fi; }
worktree "$FIX_WT" || stop "no fix worktree"
cd "$FIX_WT" || exit 1
git fetch -q origin main "+pull/$PR/head:pr$PR" || stop fetch
git diff --name-only "origin/main...pr$PR" | grep -q "^tools/dev/gaps.txt$" && GAPS=1
if [ -z "${CONCERT_MERGED:-}" ]; then
  git merge --abort >/dev/null 2>&1; git reset -q --hard
  git checkout -q -B "fix$PR" "pr$PR" || stop checkout
  git merge -q --no-edit origin/main >/dev/null 2>&1
  code=$(git diff --name-only --diff-filter=U | grep -vE "$GEN" | grep -vE "$REDO")
  [ -n "$code" ] && { git merge --abort; stop "code clashes: $(echo $code)"; }
  for f in $(git diff --name-only --diff-filter=U); do take_main "$f"; done
  node tools/dev/schema.mjs --write >/dev/null 2>&1; git add -A
  git -c core.editor=true commit -q --no-edit 2>/dev/null
fi
for f in $(git diff --name-only origin/main | grep -E "$GEN"); do take_main "$f"; done
git commit -q -m "Built data back to main's copy before the rebuild

Co-Authored-By: Claude <noreply@anthropic.com>" 2>/dev/null
echo "  main $(git rev-parse --short origin/main) merged; code differs from main in: $(git diff --name-only origin/main | grep -vE "$GEN" | tr '\n' ' ')"
[ -d build ] && { chmod -R u+w build; rm -rf build; }
WI_NO_TICKET=1 python tools/pipeline.py --from sync patch > "$LOG/pipe-$PR.txt" 2>&1
git checkout -q -- data/faults.json 2>/dev/null
grep -qE "files? into data/ in one step" "$LOG/pipe-$PR.txt" && ! grep -q "^FAILED" "$LOG/pipe-$PR.txt" \
  || stop "pipeline: $(grep -E '^FAILED|DATA FAULT' "$LOG/pipe-$PR.txt" | head -2 | tr '\n' ' ')"
if [ -n "${GAPS:-}" ]; then WI_NO_TICKET=1 python tools/pipeline.py --only gamepull > "$LOG/gaps-$PR.txt" 2>&1 || stop "gamepull"; git checkout -q -- data/faults.json 2>/dev/null; fi
git add -A && git commit -q -m "Data rebuilt on main from #$PR's code (pipeline --from sync)

Co-Authored-By: Claude <noreply@anthropic.com>"
p=$(python tools/pipeline.py --check 2>&1 | tail -1); echo "  pipeline --check: $p"; case "$p" in ok*) ;; *) stop "pipeline --check";; esac
node tools/dev/guard.mjs > "$LOG/guard-$PR.txt" 2>&1
tail -1 "$LOG/guard-$PR.txt" | grep -q " 0 failed" || stop "guard: $(grep -E '^FAIL' "$LOG/guard-$PR.txt" | head -3 | tr '\n' ' ')"
echo "  guard: $(tail -1 "$LOG/guard-$PR.txt")"
node tools/dev/dumpreport.mjs origin/main > "$LOG/dump-$PR.md" 2>&1
sed -n '/^### Cards by kind/,/^### Fields/p' "$LOG/dump-$PR.md" | grep '^- '
grep -q "Nothing flagged" "$LOG/dump-$PR.md" && echo "  dump: nothing flagged" || { echo "  dump FLAGGED:"; sed -n '/flagged/,/^###/p' "$LOG/dump-$PR.md" | grep '^- '; exit 3; }
echo "  ready: fix$PR -> $(gh pr view "$PR" -R "$REPO" --json headRefName --jq .headRefName)"
