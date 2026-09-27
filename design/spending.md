# Spending guide: Cloudflare capacity, the playerbase, and a community-funded site

For [#128](https://github.com/metaseonso/wraeclast-index/issues/128), [#33](https://github.com/metaseonso/wraeclast-index/issues/33),
[#94](https://github.com/metaseonso/wraeclast-index/issues/94) and [#121](https://github.com/metaseonso/wraeclast-index/issues/121).
Written 27 September 2026 against origin/main `5973867`. Docs only: no site code changes. Builds on
`design/traffic.md` and `design/mcp.md` (PR #130), which measured what one visit costs: **~7.5 worker calls and
~18 D1 rows written per typical visit**, and **~22,000 worker calls a day today, mostly crawlers**.

Labels, used everywhere below:

- **Checked (date)**: read on the source page on that date, link given.
- **Code / Measured / Snapshot**: as in `design/traffic.md`.
- **Estimate**: a number worked out here. Every modelled number is one.
- **Unverified**: from a secondary source, or not confirmed on a first-party page.

---

## Executive summary

**What WI is in for: $5 a month, nearly every month, at every traffic level short of a big hit.** Cloudflare
bills Workers Paid at a $5 minimum, and that $5 includes more than WI uses in all but the first month of 1.0
in the high scenario. The risk was never the bill. It is the **free plan's daily cliff**: past 100,000 worker
requests or 100,000 D1 rows written in a UTC day, prices, crawler pages and the service worker stop until
midnight.

Monthly Cloudflare cost, Estimate (model and assumptions in section 4):

| Phase | Low (1.0 Steam peak 450k, WI reach 1%) | Mid (700k, 3%) | High (1M, 8%) |
|---|---|---|---|
| **Now** (0.5.5 Forbidden Rites, to 11 Dec; ~50 visits/day, ~22k calls/day) | $0 on Free (22% of the cap) | same | same |
| **1.0 launch month** (7 days of week 1 + 23 days of weeks 2-4) | **$5** | **$5** | **$23-27** without the fixes; **$7** with fixes 3-6 of `traffic.md` |
| 1.0 week 1 alone (visits/day) | 8,400 | 39,000 | 150,000 |
| **Mid-league month** (month 2) | $5 | $5 | $5 |
| **Quiet month** (month 3 on) | $5 | $5 | $5 |
| With 4 more languages (ru, pt-BR, ko, de) on, launch month | $5 | $5-6.50 | $8 with fixes; **$40** without |
| **A year** | **~$60** | **~$60** | **~$80-100** without fixes, **~$62** with |

Plus the domain renewal (Unverified; a .fyi at Cloudflare Registrar is at cost, roughly $1-2 a month spread
over the year) and $0 for GitHub Actions (public repo, standard runners: free; checked 27 Sep 2026,
<https://docs.github.com/en/billing/concepts/product-billing/github-actions>).

What the free plan would do instead, Estimate: it breaks in **1.0 week 1 in every scenario** without the fixes
(low: 104k calls and 153k D1 writes a day), and even **with** the fixes in the mid and high scenarios. Move to
Workers Paid before 1.0.

**The tail**: an unblocked scraper at 10 M requests a day on Paid costs ~$3/day in requests plus ~$6/day in
Workers Logs (unsampled). Left alone for a month, ~$270. That is what the WAF kill switches, the rate-limit rule,
log sampling and a budget alert are for. Cloudflare has **no hard spend cap** (below).

**Rares (#94)**: Cloudflare is not the limit. GGG's trade site is (~100 searches an hour per IP; WI uses 88).
Twenty shapes a day (#94's goal) fit in today's budget with room to spare; ~200 a day fit by trimming; pricing any
single rare a player holds is only possible from the player's own machine. Section 6.

**Donations** will very likely cover $5 a month many times over (Estimate, section 8). The design question is
not "how to ask for more" but "how to show where it goes". A public running-costs page, a banner only when
capacity is actually stressed, and nothing ever behind a paywall.

---

## 1. Spend order

What to pay for, first to last. **Running cost** = monthly, keeps the lights on. **Investment** = one-off work or
money that lowers the running cost or the risk for good.

| # | What | Cost | Kind | Why, and when |
|---|---|---|---|---|
| 1 | **Workers Paid** | **$5/month** | Running | Removes the 100k/day request cliff, the 10 ms CPU limit (cold isolates already run 60-160 ms, p99 59 ms: Snapshot), and D1's 100k writes/day cliff. Raises static files per version from 20,000 to 100,000, which languages need (section 5). **Switch by ~1 Dec 2026**, then run the 10x load test from `traffic.md` against a preview version (~$0.04). Stay on it through quiet months: dropping back to Free re-arms the cliff for the next patch day. |
| 2 | **Budget alerts** at $10 and $25 | $0 | Safety | Cloudflare's Budget alerts (Pay-as-you-go accounts, since April 2026; on by default for new PAYG accounts since June 2026) are **informational only, fire the day after, and do not cap spend**. Checked 27 Sep 2026: <https://developers.cloudflare.com/billing/manage/budget-alerts/> (page dated 29 May 2026), <https://developers.cloudflare.com/changelog/post/2026-04-13-billable-usage-dashboard-and-budget-alerts/>, <https://developers.cloudflare.com/changelog/post/2026-06-15-budget-alerts-default-on/>. The subscription fee is not counted in the threshold. |
| 3 | **Zone rate-limit rule + WAF kill switches** (`traffic.md` fix 2) | $0 (Free zone: 5 custom rules, 1 rate-limit rule) | Safety | The only real spend cap. Blocked requests never reach the worker, so they are never billed. |
| 4 | **Log sampling** `head_sampling_rate: 0.1` | $0 | Investment (one line) | Workers Logs is the second-largest line in every bad month ($0.60/M past 20 M events). |
| 5 | **Lighter tracking** (fix 3), ideally into **Workers Analytics Engine** instead of D1 | $0 today | Investment (small code) | Tracking is ~13 of the ~18 D1 rows per visit. Analytics Engine: 10 M data points/month included on Paid, $0.25/M after, **not billed at all yet** (checked 27 Sep 2026, <https://developers.cloudflare.com/analytics/analytics-engine/pricing/>). Takes D1's write limit out of play. |
| 6 | **`sw.js` and `leagues.json` static** (fix 4), **crawler pages static** (fix 5), **D1 indexes** (fix 6) | $0 | Investment (small to medium code) | Fix 5 turns all crawler traffic (most of today's calls, and ×N with languages) into free static requests. These are what keep the high scenario at $7 instead of $27-40. |
| 7 | Domain renewal | ~$15-20/year (Unverified) | Running | Put it on the running-costs page; it is real. |
| 8 | Reserve: three months of running costs held back (~$20) | from donations | Buffer | So a slow donation month never touches the site. |

### Do not pay for, yet

| Product | Price (checked 27 Sep 2026) | Why not |
|---|---|---|
| **Pro zone plan** | $25/month monthly, $20 annual (<https://www.cloudflare.com/plans/network-cdn/>) | Adds 20 custom rules, 2 rate-limit rules (1-minute windows, 1-hour blocks), Super Bot Fight Mode, image optimisation. Five times the whole Workers bill, for problems WI does not have. Revisit only if a distributed scraper gets past the free rules for days. |
| Business zone plan | $250/month monthly, $200 annual | 100% uptime SLA, PCI, 5 rate-limit rules with 10-minute windows. No. |
| Enterprise / Bot Management | contract | No. |
| **Workers Cache** | billed per request like a worker call, **static requests included** once on (<https://developers.cloudflare.com/workers/platform/pricing/>) | Makes free static traffic billable. `traffic.md` says the same. |
| Workers Logpush | Paid only, 10 M/month then $0.05/M | Workers Logs (sampled) and the `/admin` dashboard are enough. |
| KV, R2, Durable Objects, Queues | KV 10 M reads/1 M writes included; R2 10 GB + 1 M Class A + 10 M Class B free, egress free; DO 1 M requests included; Queues 1 M ops included | Nothing in WI needs them. D1 + static files cover it. Queues is the one to remember for community rare submissions (section 6), and it is inside Paid. |
| Cloudflare Images | 5,000 unique transformations/month free, then $0.50 per 1,000 (<https://developers.cloudflare.com/images/pricing/>) | Sprites and art are already static files. |
| Cache Reserve, Argo, Load Balancing | usage / from $5 | Static assets are already served from the edge for free. |
| Ko-fi Gold | $12/month (Unverified, secondary sources) | More than the whole hosting bill; it only removes Ko-fi's 5% on memberships/shop, and tips are 0% anyway. |

---

## 2. Cloudflare prices and limits (checked 27 Sep 2026)

Sources: Workers pricing <https://developers.cloudflare.com/workers/platform/pricing/> (page dated 28 Aug 2026),
Workers limits <https://developers.cloudflare.com/workers/platform/limits/> (5 Sep 2026), D1 pricing
<https://developers.cloudflare.com/d1/platform/pricing/> (21 Apr 2026), R2 <https://developers.cloudflare.com/r2/pricing/>,
rate-limiting rules <https://developers.cloudflare.com/waf/rate-limiting-rules/>, custom rules
<https://developers.cloudflare.com/waf/custom-rules/>, bots <https://developers.cloudflare.com/bots/get-started/super-bot-fight-mode/>,
Logpush <https://developers.cloudflare.com/logs/logpush/>.

**Workers tiers.** Two self-serve tiers: **Free** and **Paid** ($5/month minimum, the "Standard" usage model).
Enterprise is by contract. No newer self-serve tier exists on the pricing page as of this date.

| | Free | Paid ($5/month) |
|---|---|---|
| Worker requests | 100,000/day, then 429 on `run_worker_first` paths | 10 M/month, then $0.30/M |
| CPU per call | 10 ms | 30 s default, up to 5 min; 30 M CPU-ms/month included, then $0.02/M |
| Static asset requests | free, unlimited | free, unlimited |
| Static files per version | **20,000** | **100,000** |
| Subrequests per call | 50 | 10,000 |
| Cron triggers per account | 5 | 250 |
| Workers Logs | 200k events/day, 3-day retention | 20 M/month, then $0.60/M, 7-day retention |
| Workers Logpush | no | 10 M/month, then $0.05/M |
| Workers Cache | bills cached hits as requests | same |
| D1 rows read | 5 M/day | 25 B/month, then $0.001/M |
| D1 rows written | 100k/day (all queries fail past it) | 50 M/month, then $1.00/M |
| D1 storage | 5 GB total | 5 GB, then $0.75/GB-month |
| KV | 100k reads, 1k writes/day, 1 GB | 10 M reads, 1 M writes/month, 1 GB; $0.50/M reads, $5/M writes, $0.50/GB |
| Durable Objects | 100k requests/day, 13,000 GB-s/day | 1 M requests, 400k GB-s/month; $0.15/M, $12.50/M GB-s |
| Queues | 10k ops/day | 1 M ops/month, then $0.40/M |
| Analytics Engine | 100k points, 10k queries/day | 10 M points, 1 M queries/month; $0.25/M, $1/M; **not billed yet** |
| R2 | 10 GB, 1 M Class A, 10 M Class B free; egress free | $0.015/GB, $4.50/M A, $0.36/M B |
| Workers Rate Limiting binding | 10 s or 60 s windows, per location | same; no price listed on its page (Unverified whether it is ever billed) |
| Bandwidth / egress | not billed on any plan for Workers, static assets or the CDN | same |

**Zone plans** (per domain, separate from Workers):

| | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Price | $0 | $25/mo monthly, $20 annual | $250/mo monthly, $200 annual | contract |
| WAF custom rules | 5 | 20 | 100 (regex) | 1,000 |
| Rate-limiting rules | 1 (10 s window, 10 s block, per IP) | 2 (1 min, 1 h block) | 5 (10 min, 1 day, NAT-aware) | 100 |
| Bots | Bot Fight Mode | Super Bot Fight Mode | Super Bot Fight Mode | Bot Management add-on |
| Image optimisation | no | yes (Polish) | yes | yes |
| Uptime SLA | none | none | 100% with credits | yes |
| Full Logpush | no | no | no | yes |

**Spend caps**: none. Budget alerts only warn, a day late. The caps are the ones WI sets itself: WAF rules, the
rate-limit rule, the budget cron for `/mcp` (`design/mcp.md`), and `"limits": {"cpu_ms": 300}`.

---

## 3. The playerbase

### Steam concurrent players per league

Monthly peaks and averages from SteamCharts, checked 27 Sep 2026, <https://steamcharts.com/app/2694490>. League
start dates from WI's own `data/leagues.json` (poe2db, NZ dates).

| League | Start | Steam peak in launch month | Month 2 avg | Month 3 avg |
|---|---|---|---|---|
| 0.1 Early Access | 7 Dec 2024 | **578,562** (all-time) | 190,494 (Jan) | 88,935 (Feb) |
| 0.2 Dawn of the Hunt | 5 Apr 2025 | 245,870 | 33,895 (May) | 15,524 (Jun) |
| 0.3 Rise of the Abyssal / Third Edict | 30 Aug 2025 | 352,104 (Aug), 333,360 (Sep) | 36,444 (Oct) | 12,281 (Nov) |
| 0.4 Fate of the Vaal | 13 Dec 2025 | 290,305 | 56,873 (Jan) | 19,839 (Feb) |
| 0.5 Runes of Aldur | 30 May 2026 | **420,409** (~406k on launch day: Unverified, <https://www.poebuilds.net/post/path-of-exile-2-0-5-launch-day>) | 173,022 (Jun, first full month) | 52,968 (Jul); 19,065 (Aug) |
| 0.5.5 Forbidden Rites (event) | 5 Sep 2026 | 147,624 (last 30 days); 48,215 avg | | |
| **1.0** | **11 Dec 2026 (Americas) / 12 Dec (NZ), subject to change** | free-to-play on PC (Steam, Epic, standalone), PS5, Xbox; Duelist | | |

1.0 sources: <https://maxroll.gg/poe2/news/path-of-exile-2-1-0-to-launch-december-11th> (25 Aug 2026),
<https://gameinformer.com/gamescom-2026/2026/08/25/path-of-exile-2-launches-in-10-this-december>,
<https://en.wikipedia.org/wiki/Path_of_Exile_2>. 0.5.5 date: <https://maxroll.gg/poe2/news/0-5-5-forbidden-rites-event-launch-date-and-endgame-changes>.

**The decay curve** (0.5, the best-measured league; Estimate from the monthly figures): average concurrent players
in the first full month ~41% of the launch peak, month 2 ~13%, month 3 ~5%. Week 1 averages about 55% of the peak.
Leagues lose ~90% of their players by month 3; the peaks come back at every league start and big patch.

### Other platforms and regions

GGG's 2025 annual report, revenue by platform for December 2025 (Unverified: reported by VGTimes from a ResetEra
post, 28 Jun 2026, <https://vgtimes.com/gaming-news/159408-grinding-gear-games-reveals-path-of-exile-2-revenue-breakdown-by-platform-for-december-2025.html>):
Steam 58.7%, GGG direct (standalone client) 14%, PlayStation 11%, **Tencent (China) 7.9%**, Xbox 3%, **Kakao
(Korea) 2.9%**, Hotcool (HK/TW) 0.89%, Epic 0.21%. Revenue is not players, but it is the only split GGG has
published. Used as a player proxy (Estimate): **standalone PC ≈ +24% of Steam, consoles ≈ +24% of Steam**,
Kakao ≈ +5%. **Tencent runs a separate China realm** (since 0.3, Unverified,
<https://www.itemd2r.com/en/blog/poe-2/path-of-exile-2-launches-chinese-server-with-patch-030>): its economy is not
WI's prices, so it is left out of reach.

Early access sold over 1 million copies before launch (<https://www.gamespot.com/articles/path-of-exile-2-passes-over-1-million-early-access-players-dev-warns-of-server-struggles/1100-6528281/>).

### Languages

- **GGG's game languages** (Steam page, checked 27 Sep 2026, <https://store.steampowered.com/app/2694490/Path_of_Exile_2/>):
  English, French, German, Spanish, Japanese, Korean, Portuguese-Brazil, Russian, Thai (9). Plus Traditional and
  Simplified Chinese in the Garena/Tencent clients.
- **poe2db ships 11** (checked 27 Sep 2026, <https://poe2db.tw/>): zh-TW, zh-CN, en, ko, ru, ja, fr, de, th, pt, es.
- **PoE2's own Steam reviews by language** (Measured today via the Steam reviews API, 226,654 reviews): English
  58.8%, **Russian 14.1%**, **Portuguese-BR 5.3%**, **German 4.7%**, Polish 3.0%, French 2.6%, Spanish 3.0%
  (incl. Latin America 0.4%), Turkish 1.9%, Thai 1.2%, Simplified Chinese 1.2%, Japanese 0.7%, Ukrainian 0.6%,
  Korean 0.1% (Koreans play through Kakao, not Steam). This is a better proxy for *PoE2* players than Steam's
  whole-platform survey (English 38.3%, Simplified Chinese 24.0%, Russian 9.9%, Aug 2026,
  <https://store.steampowered.com/hwsurvey/Steam-Hardware-Software-Survey-Welcome-to-Steam>), which is dominated by
  Chinese players who are on the separate realm.
- Polish, Turkish and Ukrainian players are real (5.5% together) but **GGG has no translation for them**, so #121
  (GGG's own words only) cannot serve them.

### Comparable sites (all Unverified: third-party panel estimates)

| Site | Monthly visits | Month | Source |
|---|---|---|---|
| poe.ninja (PoE1 + PoE2) | 22.15 M / 15.64 M / 12.74 M | Jun / Jul / Aug 2026 | <https://www.semrush.com/website/poe.ninja/overview/>; Similarweb: 12.6 M over 3 months, Russia 15.8%, US 13.4% (<https://www.similarweb.com/website/poe.ninja/>) |
| poe2db.tw | 5.7 M / 2.68 M | Jul / Aug 2026 | <https://www.semrush.com/website/poe2db.tw/overview/>: US 23%, South Korea 9.6%, Taiwan 8% |
| craftofexile.com | 1.22 M / 1.14 M | Jul / Aug 2026 | <https://www.semrush.com/website/craftofexile.com/overview/>: US 26%, RU 8.6%, DE 7.2% |
| poe2wiki.net | 0.34 M | Aug 2026 | <https://www.semrush.com/website/poe2wiki.net/overview/>: US 61%, DE 7.9% |
| maxroll.gg (all games) | rank #4,261 global, 3.3 pages/visit | Jun 2026 | <https://www.similarweb.com/website/maxroll.gg/>; no PoE2-only figure |

**Calibration** (Estimate): poe2db, the biggest PoE2-only reference site, had ~184k visits/day in July (Steam avg
53k) and ~86k/day in August (avg 19k): **about 3.5-4.5 visits a day per average concurrent Steam player**. The
model below puts WI's mid scenario at ~2.5% of that, the high one at ~7%.

---

## 4. The model

All Estimate. One row per step, so any assumption can be swapped.

| Step | Assumption | Low | Mid | High |
|---|---|---|---|---|
| 1.0 Steam peak concurrent | EA was 578k when it cost money; 0.5 did 420k; 1.0 is F2P, on Epic and consoles day one | 450k | 700k | 1.0 M |
| Avg concurrent by phase | week 1 55% of peak, weeks 2-4 38%, month 2 13%, month 3+ 5% (0.5's curve) | | | |
| Steam daily players | 4 × average concurrent | | | |
| All global-realm players | Steam × (1 + 0.24 standalone) PC, + Steam × 0.24 console; China realm excluded | | | |
| Use a web tool on a given day | PC 50%, console 15% | | | |
| **WI's share of web-tool users** | WI is new, English-only, PC-first | **1%** | **3%** | **8%** |
| Visits per user per day | | 1.3 | 1.3 | 1.3 |
| Worker calls per visit | `traffic.md` (Code) | 7.5 today; **4.5** after fixes 3 and 4 | | |
| D1 rows written per visit | `traffic.md` | 18 today; **5** after fix 3 | | |
| D1 rows read per call | Snapshot (0.3 M reads / 22k calls) | 14 today; ~3 after fix 6 | | |
| Crawlers, scanners | today ~20k calls/day; 1.0 doubles it; **× number of languages** if crawler pages stay worker-rendered | 40k/day (English) | | |
| After fix 5 | crawler pages static; scanners and unknown paths still run the worker | 5k/day | | |
| Data jobs | flat | 340/day | | |
| CPU | 3 ms mean per call (Snapshot) | | | |

### Daily load by phase (English only)

| Scenario | Phase | Steam avg concurrent | WI visits/day | Worker calls/day (today's code) | D1 writes/day (today) | D1 reads/day (today) | Calls/day (fixes 3-6) | Writes/day (fixes) | Free plan survives? (today / fixes) |
|---|---|---|---|---|---|---|---|---|---|
| low | 1.0 week 1 | 248k | 8,443 | 103,660 | 153,469 | 1.5 M | 43,332 | 43,714 | no / yes |
| low | 1.0 weeks 2-4 | 171k | 5,833 | 84,089 | 106,497 | 1.2 M | 31,589 | 30,666 | no / yes |
| low | mid-league (month 2) | 58k | 1,996 | 55,307 | 37,420 | 0.8 M | 14,320 | 11,478 | yes / yes |
| low | quiet (month 3+) | 22k | 768 | 46,096 | 15,315 | 0.6 M | 8,794 | 5,338 | yes / yes |
| mid | 1.0 week 1 | 385k | 39,399 | 335,835 | 710,688 | 4.7 M | 182,637 | 198,497 | no / no |
| mid | 1.0 weeks 2-4 | 266k | 27,221 | 244,500 | 491,485 | 3.4 M | 127,836 | 137,607 | no / no |
| mid | mid-league (month 2) | 91k | 9,313 | 110,184 | 169,126 | 1.5 M | 47,247 | 48,063 | no / yes |
| mid | quiet (month 3+) | 35k | 3,582 | 67,203 | 65,972 | 0.9 M | 21,458 | 19,409 | yes / yes |
| high | 1.0 week 1 | 550k | 150,093 | 1,166,036 | 2,703,170 | 16.3 M | 680,758 | 751,964 | no / no |
| high | 1.0 weeks 2-4 | 380k | 103,700 | 818,094 | 1,868,109 | 11.5 M | 471,992 | 520,002 | no / no |
| high | mid-league (month 2) | 130k | 35,476 | 306,414 | 640,077 | 4.3 M | 164,984 | 178,882 | no / no |
| high | quiet (month 3+) | 50k | 13,645 | 142,676 | 247,106 | 2.0 M | 66,742 | 69,724 | no / yes |

**Patch-day spikes** (Estimate): a big patch-notes day or a league announcement doubles that day's visits. A
Reddit front-page or streamer moment could bring 500k visits in a day: 3.75 M calls and 9 M D1 writes with
today's code; on Paid, about $1-10 for the day if the month's included amounts are already spent, $0 otherwise.

**Bandwidth**: `market.json` averaged ~163 kB per response in the snapshot (437 MB over 2,678 requests), and a
first visit loads ~2 MB of index files. High week 1 is roughly 50-100 GB a day. **Cloudflare bills no egress**
for Workers, static assets or the CDN, so this is $0; it matters for players on phone data, not for the bill.

### Monthly cost, Workers Paid

| Scenario | Month | Today's code, logs full | Today's code, logs 10% | Fixes 3-6, logs 10% | +4 languages, today's code | +4 languages, fixes |
|---|---|---|---|---|---|---|
| low | Launch month | $5.00 (2.7 M calls) | $5.00 | $5.00 (1.0 M) | $5.00 (7.8 M) | $5.00 (1.2 M) |
| low | Mid-league | $5.00 (1.7 M) | $5.00 | $5.00 (0.4 M) | $5.00 (6.6 M) | $5.00 (0.5 M) |
| low | Quiet | $5.00 (1.4 M) | $5.00 | $5.00 (0.3 M) | $5.00 (6.2 M) | $5.00 (0.3 M) |
| mid | Launch month | $5.00 (8.0 M) | $5.00 | $5.00 (4.2 M) | $6.51 (14.2 M) | $5.00 (5.1 M) |
| mid | Mid-league | $5.00 (3.3 M) | $5.00 | $5.00 (1.4 M) | $5.00 (8.5 M) | $5.00 (1.7 M) |
| mid | Quiet | $5.00 (2.0 M) | $5.00 | $5.00 (0.6 M) | $5.00 (7.0 M) | $5.00 (0.7 M) |
| high | Launch month | **$27.19** (27.0 M) | $23.00 | **$7.02** (15.6 M) | **$39.66** (37.2 M) | $8.19 (18.9 M) |
| high | Mid-league | $5.00 (9.2 M) | $5.00 | $5.00 (4.9 M) | $7.04 (15.7 M) | $5.00 (6.0 M) |
| high | Quiet | $5.00 (4.3 M) | $5.00 | $5.00 (2.0 M) | $5.00 (9.7 M) | $5.00 (2.4 M) |

The high launch month's $27 is: requests (27 M - 10 M) × $0.30 = $5.10, D1 writes (62 M - 50 M) × $1 = $12,
logs (27 M - 20 M) × $0.60 = $4.20, CPU ~$0.90, plus $5. Fix 3 removes the D1 line, fix 8 the logs line.

On the free plan, "$0" only holds in the rows marked "yes" above. Every "no" row is a day with prices down.

---

## 5. Capacity: what breaks first, and the fix

| Traffic (visits/day, 1.0) | What breaks first | Fix |
|---|---|---|
| Today (~50, plus ~22k crawler calls) | Nothing. Free CPU 10 ms is already exceeded by cold isolates and cache misses (p99 59 ms, Snapshot); they mostly get through, not guaranteed | Workers Paid |
| **~2,500-5,400** | **Free: D1 100k rows written/day** (tracking, ~18 rows/visit on top of today's crawlers and jobs). Every D1 query then fails: prices, jobs, Suggest | Paid; or fix 3 (moves it to ~12k visits) |
| **~8,000-10,000** | **Free: 100k worker requests/day** (7.5 calls/visit + crawlers). Worker paths 429 until 00:00 UTC | Paid; fixes 4 and 5 |
| Any, with 2+ languages and fix 5 | **Free: 20,000 static files per version** (7,223 crawler pages × each language, plus per-card MCP files) | Paid (100,000). At 11 languages even that is tight: 7,223 × 11 = 79k crawler pages alone. Localise crawler pages for the top 4-5 languages only; keep MCP per-card files English |
| ~13k-19k | Free: D1 5 M reads/day (full-table scans on `market.json` misses) | Fix 6 (indexes) |
| **~44k** (today's code) / **~74k** (fixed) | Paid: 10 M requests/month included is used up | Nothing to fix: $0.30 per extra million. At 150k visits/day with fixes, ~$1.70/month |
| ~90k (today's code) | Paid: 50 M D1 writes/month included | Fix 3 / Analytics Engine; otherwise $1/M |
| ~90k (today's code) | Paid: 20 M log events/month | Sampling (fix 8) |
| ~500k+ in one day | D1 is one database; tracking batches at ~20-60/s in the peak hour (Estimate) start to queue | Fix 3 / Analytics Engine takes tracking out of D1 entirely |
| **Any traffic** | **GGG trade API: ~100 searches/hour per IP.** Prices refresh at the same rate at 50 visits or 500,000 | Not money. Section 6 |
| Any traffic | A looping agent, scraper or scanner | Zone rate-limit rule, WAF kill switches, `/mcp` budget cron (`design/mcp.md`) |

---

## 6. Rare prices (#94): what scale is possible

**The binding limit is GGG, not Cloudflare.** `tools/pricepull.py` (Code): `BUDGET = 88` searches per hourly run,
because "the trade site allows about 100 an hour from one address"; it spreads them over 55 minutes, reads
`X-Rate-Limit-Ip` / `-State`, and stops on a limit. Today's 906 priced things need **38 searches an hour** to be
seen once a day; 88 gives a full pass every ~10 hours. The worst day seen was 16-search runs (57-hour pass).
GGG's developer docs: limits "are dynamic and can change at any time", and "exceeding these limits frequently will
result in your application access being revoked" (checked 27 Sep 2026, <https://www.pathofexile.com/developer/docs>).
PoE2 has no public stash stream (#94), so sampled searches are the only legal source.

**Spare budget**: 88 - 38 = ~50 searches an hour in a good hour, ~1,200 a day on paper. Cut-short runs eat into it.
Reserving **8 an hour for rares** (~190 a day) keeps the 24-hour pass for everything else (it goes from ~10 h to
~11 h).

| Rare pricing level | Shapes | Refresh | Searches/day | Fits today's budget? | Cloudflare cost |
|---|---|---|---|---|---|
| **#94's goal** | 20 | daily | 20 (<1/hour) | **Yes, easily** | ~20 rows written/day, 2 ingest calls. $0 |
| Wide | 100 | daily | 100 (~4/hour) | Yes | $0 |
| Broad | 200 | daily | 200 (~8/hour) | Yes, pass goes ~10 h to ~11 h | $0; `market.json` grows ~20 kB |
| Fresh | 50 | 4× a day | 200 | Yes | $0 |
| "Every base × key mod set × tier" | ~2,000+ | daily | 2,000+ (~85/hour) | **No**: the whole budget | $0 on Cloudflare; impossible at GGG |
| Price the rare a player is holding | any | on demand | 1-3 per check | **Only from the player's own IP** | n/a |

Estimate: each shape is one search plus one fetch; the price is the middle of the cheapest listings, and a shape
with too few listings says so (#94's rule: real prices only).

**Options to go further, with cost:**

| Option | Adds | Cost | Verdict |
|---|---|---|---|
| **Re-prioritise**: uniques worth < 1 exalted checked every 3 days instead of daily | ~15-20 searches/hour (Estimate) | $0, small `pricepull.py` change | **Do this first** if 200 shapes is not enough |
| **Caching / slower refresh**: rare floors move slowly; refresh most shapes every 2-3 days | 2-3× the shapes for the same searches | $0 | Yes; say the age on the card, as every price does |
| More sampling time | nothing: runs already use 55 of 60 minutes | $0 | Already maxed |
| More IPs (parallel runners, a VPS) | 88/hour per extra address | $0 (Actions) or ~$5/month (VPS, Unverified) | **No** unless GGG agrees in writing: it is working around a per-IP limit, and "access revoked" would take every WI price with it |
| Ask GGG for an OAuth app / higher limit | unknown | $0 | Worth an email; no promise (Unverified whether PoE2 trade is offered to apps) |
| **Community submissions** from the PC overlay / price-check tool (#114, #115): opt-in, the player's own search on the player's own IP, results (shape, cheapest N prices, listing count, time; no account names) sent to WI | scales with players, not with WI's budget | per submission 1 worker call + ~3-4 rows written. 10k submissions/day = 0.3 M calls + ~1.2 M writes a month: **$0 on Paid**; on Free, 40% of the daily write limit | **The only route to "price my rare"**. Needs Paid, a rate-limit binding, outlier rejection and a minimum of distinct submitters per shape before a floor shows |
| Link out: a "search this on the trade site" button prefilled with the shape | the player's own search | $0 | Ship it with the floors |

**Verdict**: rares can be priced now. #94's 20 shapes a day fit today's budget at $0; ~200 fit with a small
re-prioritisation. Cloudflare capacity is not the question at any size; GGG's per-IP budget is, and community
submissions through the overlay are how it grows past that.

---

## 7. Languages (#121): what each adds

Reach index (Estimate): each language's share of global-realm players (Steam reviews above, with Kakao Korea added
as ~4%), times how many of them would *not* use an English-only site (Russian 65%, Portuguese-BR 65%, German 30%,
Korean 70%, Spanish 55%, French 50%, Thai 65%, Japanese 75%, Chinese 75%; guesses).

| Order | Language | Share of players | Adds to WI's reach | Cumulative |
|---|---|---|---|---|
| 1 | **Russian** | 13.5% | **+11.5%** | ×1.12 |
| 2 | **Portuguese (BR)** | 5.1% | +4.4% | ×1.16 |
| 3 | **Korean** (Kakao players, poe2db's #2 country) | ~4% | +3.8% | ×1.21 |
| 4 | German | 4.5% | +1.8% | ×1.22 |
| 5 | Spanish | 2.9% | +2.1% | ×1.24 |
| 6 | French | 2.5% | +1.6% | ×1.25 |
| 7 | Thai | 1.1% | +1.0% | ×1.26 |
| 8 | Japanese | 0.7% | +0.7% | ×1.27 |
| 9-10 | Chinese (Simplified, Traditional) | 1.2% | +1.2% | ×1.28 |

**All ten add ~28% reach; the first three add ~21%.** Russian alone is worth more than the next five together
(poe.ninja's biggest country is Russia, 11-16%). The model's "+4 languages" column uses ×1.21.

**Cost of languages**: the words are static files, so a visit in Russian costs the same worker calls as one in
English: $0 extra. What languages *do* cost:

- **Crawler pages × languages.** If `/item/*` stays worker-rendered, crawlers fetch every page in every language:
  40k calls/day becomes ~200k with five languages (the "+4 languages, today's code" column: $40 in the high launch
  month). With fix 5 (static crawler pages) it is $0.
- **Static file count**: 7,223 pages × 5 languages = 36k files, over Free's 20,000 per version; inside Paid's
  100,000. Eleven languages would not fit with per-card MCP files too.
- Index files per language (~2 MB each) are free static requests.

---

## 8. Community funding: a community tool, funded by its community

### What donations will likely look like (Estimate, Unverified rates)

Fan-tool donation rates are commonly 0.05-0.5% of monthly users (Unverified). Mid scenario, launch month: ~30k
people a day, ~100k in the month; at 0.05-0.2% and ~$5 each, **$250-1,000 in the launch month**, against a **$5**
bill. Low scenario: $50-200. Quiet months: a tenth of that. Ko-fi takes 0% on one-off tips (the card/PayPal
processor still takes roughly 2.9% + $0.30: a $5 tip lands as ~$4.55; Unverified, secondary sources:
<https://schoolmaker.com/blog/ko-fi-pricing>); one source says new Ko-fi accounts can be charged 5% on tips until
it is switched off (Unverified, <https://knowyourcut.com/blog/kofi-fees-2026>). Crypto: no platform fee.

So the honest message is **"the costs are covered; here is where the rest goes"**, not "help keep the lights on".
Saying the real, small number is the classy part.

### The running-costs page

A static page (or a panel in the Support popup) built from one hand-edited file, `data/costs.json`, so it costs no
worker calls. Updated once a month from the Cloudflare invoice and the Ko-fi dashboard.

- This month: Cloudflare (from the invoice), domain (yearly ÷ 12), total.
- Donations this month, and the reserve.
- What support pays for, in plain units:

| Support | Pays for |
|---|---|
| $5 | Workers Paid for a month: no daily cap on prices |
| $1 | ~3 million more requests past the plan |
| $15-20 | The domain for a year (Unverified price) |
| $20 | Three months of reserve |
| Past the reserve | Listed each month: e.g. the overlay's code-signing certificate (#115), a load test before each league, Pro zone plan only if a bot wave demands it. Owner decides; the page says what was bought |

- Supporters are not listed by name unless they ask. No leaderboard.

### The stressed-capacity banner

Shown **only** when one of these is true, and says the real numbers:

1. On Free: today's worker requests or D1 writes pass 80% of the daily limit (the dashboard's `stats.plan`
   already computes this; fix its request count first, see `traffic.md`).
2. On Paid: the month's usage cost passes the month's donations, or a Budget alert fired.
3. An incident: the worker returned 429s or D1 failed in the last hour.

Rules: one line, top of the page, dismissible, stays dismissed for the day. No modal, no countdown, no blocking,
no first-visit pop-up, no fake counts ("12 people donated today"), no guilt. Never shown in quiet months. Every card,
price and chart stays free, always: no paywall, no "supporter-only" data, no ads in its place. Static file
(`data/banner.json`, or a field in `market.json?part=live` so it rides an existing call): zero extra worker calls.

### Copy, in WI's voice

Short, plain, no helper talk (passes the same rules as `tools/dev/voice.mjs`: no "we'll", "just", "helps you",
"feel free"). Suggestions:

- Footer (exists, `assets/support.js`): **Support the site**
- Page title: **Running costs**
- Page lead: **Free to use. Funded by players. Every price, card and chart stays free.**
- Line: **September: Cloudflare $5.00, domain $1.50. Donations $38.00. Covered, with $32 to the reserve.**
- Line: **$5 runs the site for a month.**
- Banner (busy, on Paid): **Busy day: 412,000 requests since 00:00 UTC. This month: $9.40 of costs, $61 donated. Running costs**
- Banner (on Free, near the cap): **Prices may pause until 00:00 UTC: 91,000 of 100,000 daily requests used. Running costs**
- Outage line (prices down): **Prices are resting until 00:00 UTC. Cards, search and charts still work.**
- Thanks, under the Ko-fi/crypto links: **A community tool, funded by its community. Thank you.**

### Wiring (#33)

`#33` was shelved by the owner; this revives it. The link is built and hidden: fill `data/support.json`
(`{"kofi": "https://ko-fi.com/<name>", "crypto": [{"coin": "BTC", "address": "<address>"}]}`) and push, as
`traffic.md` describes. Either field alone is enough. Static, no worker calls.

---

## 9. Checklist, by date

- **Now → 1 Dec 2026**: stay on Free (22% used). Add the WAF kill-switch rules and the rate-limit rule (fix 2). Fill
  `data/support.json`. Decide the rare shapes list (#94) and reserve 8 searches/hour.
- **By 1 Dec**: Workers Paid, Budget alerts at $10 and $25, log sampling, `cpu_ms` cap. Load test on a preview.
- **With the 1.0 front end**: fixes 3-6 (tracking lighter or in Analytics Engine, `sw.js`/`leagues.json` static,
  crawler pages static, indexes). Running-costs page and the banner rules.
- **After 1.0 week 1**: read the real numbers (`node tools/dev/dash.mjs --raw cloudflare`) against the table in
  section 4, re-pick the scenario, and publish the first month's costs.
- **Languages**: Russian first, then Portuguese-BR and Korean, after fix 5.
- **Not before there is a reason**: Pro zone plan, Workers Cache, Logpush, KV/R2/DO, extra IPs for pricing.
