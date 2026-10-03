#!/usr/bin/env bash
# Shared by the concert scripts (docs/concert.md): where the repo is, the two scratch worktrees, the logs.
# The scratch worktrees sit beside the checkout this runs from and are made on first use:
#   <repo>-concert-merge  main + one PR, tested before the merge (merge.sh)
#   <repo>-concert-fix    a PR's branch with main merged in and its data rebuilt (rebuild.sh)
set -u
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MAIN=$(git -C "$HERE" rev-parse --show-toplevel)
REPO=${CONCERT_REPO:-metaseonso/wraeclast-index}
SITE=${CONCERT_SITE:-https://wraeclastindex.fyi}
LABEL=${CONCERT_LABEL:-ready}
MERGE_WT=${CONCERT_MERGE_WT:-$MAIN-concert-merge}
FIX_WT=${CONCERT_FIX_WT:-$MAIN-concert-fix}
LOG=${CONCERT_LOG:-${TMPDIR:-/tmp}/concert}
mkdir -p "$LOG"
# built data: made by the pipeline from code, never merged by hand (main's copy is taken, then rebuilt)
GEN='^(data/(cards|seo|search|explore|treechanges|patchdiff)/|data/(index|index-core|index-rest|manifest|grants|clusters|essences|kwuse|interactions|treelines|gemlines|guides|gamestats|tree-shape|map|map-nodes)\.json$|data/map\.png$|explore\.html$|sprites/(quests|trials|runes|areas|pools|bosses)(-1x)?\.webp$)'
# made again after the merge: schema.json (tools/dev/schema.mjs --write), the gap report (the gamepull stage)
REDO='^(data/schema\.json|tools/dev/gaps\.txt)$'

worktree(){   # worktree <path>: make it once, detached, with its own node_modules
  [ -d "$1" ] && return 0
  git -C "$MAIN" fetch -q origin main && git -C "$MAIN" worktree add -q --detach "$1" origin/main || return 1
  (cd "$1" && npm ci --silent >/dev/null 2>&1)
}
