# Concert: many sessions, one main

Several Claude sessions work on this repo at once. One of them takes the work live. This is how they stay out of
each other's way. The skill behind it is `/concert`.

- A **player** is any session that prepares work: a data pull, a new card, a fix.
- The **conductor** is the session that takes it live. The owner starts it with **"Ship the ready PRs."**
- The owner says only two things: to a player, **"Mark it ready when it's done."** To the conductor,
  **"Ship the ready PRs."**

## Players

1. One ticket, one PR, branched from main as it is now. Stack a PR on another PR's branch only when it needs that
   code. Say so in the body: `Ships after #N`.
2. Before you mark it: `node tools/dev/guard.mjs` says 0 failed, `python tools/pipeline.py --check` says ok,
   `node tools/dev/dumpreport.mjs origin/main` flags nothing. The PR's own checks pass.
3. Mark it: add the label `ready`. That is the hand-off. Do not merge it yourself.
4. After `ready`, never force-push the branch. The conductor may push a merge commit onto it (main merged in, the
   data rebuilt). To change a ready PR, pull first and push a new commit on top.
5. Do not chase main. A PR that clashes with main only in built data is the conductor's job. Keep your own
   rows (a stage in `tools/pipeline.py`, a line in README, a field in `assets/kinds.js`) in the place they belong;
   the conductor keeps both sides when two PRs add in the same spot.
6. Local pipeline runs: set `WI_NO_TICKET=1`, so a fault on your machine does not open a GitHub issue.

Built data is what the pipeline makes from code: `data/cards/`, `data/search/`, `data/seo/`, `data/explore/`,
`data/index*.json`, `data/manifest.json`, `explore.html`, the map, `data/schema.json` and `tools/dev/gaps.txt`
(the full list is `GEN` and `REDO` in `tools/dev/concert/env.sh`). Commit it, so the PR's checks see it, but never
hand-merge it: on a clash, main's copy is taken and it is built again from your code.

## The conductor

`bash tools/dev/concert/ship.sh` ships every open PR labelled `ready`, in number order, a PR waiting for the one
it is stacked on or names in `Ships after #N`. Per PR (`tools/dev/concert/merge.sh`):

1. main + the PR, merged in a scratch worktree (`<repo>-concert-merge`); the PR's own checks finished and passed;
   guard 0 failed; `pipeline.py --check` ok; the Wrangler dry run; the dump report flags nothing.
2. Merged (never `--delete-branch`: a PR stacked on the branch would close). The Cloudflare deploy waited for, or
   none due when no site file changed, and the live site asked.
3. A clash only in built data: `tools/dev/concert/rebuild.sh` merges main into the PR's branch in
   `<repo>-concert-fix`, takes main's built data, runs `pipeline.py --from sync patch` on the PR's code, runs every
   check, pushes the merge commit to the PR's branch, says so on the PR, and merges.
4. Anything else stops the run there, nothing of that PR merged: a clash in code, a failed check, a flagged dump.
   The conductor resolves a code clash by hand in `<repo>-concert-fix` (both sides kept where both add), commits
   the merge, runs `CONCERT_MERGED=1 bash tools/dev/concert/rebuild.sh <pr>`, pushes, and runs `ship.sh` again.
   A fix that belongs to main (a pipeline rule, a check) goes to main first, as its own commit.

The conductor reports to the owner in plain words: what went live, what it changed on the way, what is left.
Logs are in `$TMPDIR/concert/` (guard, dump report, pipeline and dry run, per PR).
