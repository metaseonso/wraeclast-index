#!/usr/bin/env bash
# "Ship the ready PRs" (docs/concert.md): every open PR labelled ready, in order, each merged and checked live.
# A PR stacked on another waits for it; a PR whose body says "Ships after #N" waits for #N. A clash only in
# built data is rebuilt on main (rebuild.sh), pushed to the PR's own branch with a note, and merged. A clash in
# code, a failed check or a flagged dump report stops the run there, with nothing of that PR merged.
# usage: tools/dev/concert/ship.sh [<pr> ...]    no numbers: every open PR labelled ready
. "$(dirname "$0")/env.sh"
D=$(dirname "$0")
if [ $# -gt 0 ]; then todo="$*"
else todo=$(gh pr list -R "$REPO" --label "$LABEL" --state open --limit 200 --json number --jq '.[].number' | sort -n | tr '\n' ' ')
fi
[ -z "${todo// }" ] && { echo "== nothing labelled $LABEL"; exit 0; }
echo "== to ship: $todo"
waits(){   # the open PR this one waits for, if any
  local body base after under
  base=$(gh api "repos/$REPO/pulls/$1" --jq .base.ref)
  if [ "$base" != main ]; then
    under=$(gh api "repos/$REPO/pulls?state=open&head=${REPO%%/*}:$base" --jq '.[0].number // empty'); [ -n "$under" ] && { echo "$under"; return; }
  fi
  for after in $(gh api "repos/$REPO/pulls/$1" --jq '.body // ""' | grep -oiE 'ships after #[0-9]+' | grep -oE '[0-9]+'); do
    [ "$(gh api "repos/$REPO/pulls/$after" --jq .state)" = open ] && { echo "$after"; return; }
  done
}
done_=""
while :; do
  left=""; moved=""
  for pr in $todo; do
    case " $done_ " in *" $pr "*) continue;; esac
    w=$(waits "$pr"); if [ -n "$w" ]; then left="$left $pr"; continue; fi
    out=$(bash "$D/merge.sh" "$pr" 2>&1); rc=$?; echo "$out"
    if [ $rc -eq 2 ]; then
      echo "  rebuilding #$pr on main"
      bash "$D/rebuild.sh" "$pr" || { echo "== stopped at #$pr (rebuild)"; exit 1; }
      head=$(gh pr view "$pr" -R "$REPO" --json headRefName --jq .headRefName)
      (cd "$FIX_WT" && git push -q origin "HEAD:$head") || { echo "== stopped at #$pr (push refused: the branch moved)"; exit 1; }
      gh pr comment "$pr" -R "$REPO" -b "Rebased onto main $(cd "$FIX_WT" && git rev-parse --short origin/main) by the conductor (docs/concert.md): main merged in, main's built data taken, then \`pipeline.py --from sync patch\` run on this code. Guard 0 failed, pipeline --check ok, dump report flags nothing." >/dev/null
      out=$(bash "$D/merge.sh" "$pr" 2>&1); rc=$?; echo "$out"
    fi
    [ $rc -eq 0 ] || { echo "== stopped at #$pr"; exit 1; }
    done_="$done_ $pr"; moved=1
  done
  todo=$left
  [ -z "${todo// }" ] && { echo "== all shipped:$done_"; exit 0; }
  [ -n "$moved" ] || { echo "== stopped: waiting on PRs not on the list:$(for p in $todo; do echo -n " #$p waits for #$(waits $p)"; done)"; exit 1; }
done
