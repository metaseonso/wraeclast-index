# Wraeclast Index

Several sessions work on this repo at once. Read `docs/concert.md` before you open a PR or merge one.

- Preparing work: one ticket, one PR from main as it is now; checks pass; add the label `ready`. Never merge it
  yourself, and never force-push it after `ready`.
- Taking work live ("Ship the ready PRs"): `bash tools/dev/concert/ship.sh`.
- Local pipeline runs: `WI_NO_TICKET=1`, so a fault on your machine opens no GitHub issue.
