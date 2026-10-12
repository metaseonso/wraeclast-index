# Stage 6 preview: motion and screen

Live (https://wraeclastindex.fyi) beside the stage (this branch on `tools/dev/serve.mjs`), taken with
`node tools/dev/shot.mjs` on 12 Oct 2026, a fresh headless Chrome each.

| Page | Live | Stage |
|---|---|---|
| Home, 1440 | `live-home-1440.png` | `stage-home-1440.png` |
| Home, 375 (phone) | `live-home-375.png` | `stage-home-375.png` |
| Drill-down, 700 (the width `bridge.css` stopped wrapping at: 760 → 640) | `live-explore-700.png` | `stage-explore-700.png` |

What a player could see change: the bronze rims in `look.css` light up in 120 ms where they took 150 ms (two rules);
the drill-down's control rows stop forcing a wrap between 641 and 760 px (they wrap on their own; the page does not
scroll sideways at 700, checked); the Build tab's rows switch to their narrow layout at 640 instead of 560 px (the
tab is shut). Nothing else moves, and the still pictures are the same.
