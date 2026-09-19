# Data server

The hourly data jobs (trade prices, Currency Exchange, currency list, league dates) run on one small Ubuntu 24.04 server.

1. The key: one long random line in `wi-secrets/WI_INGEST_KEY.txt`, e.g. `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
2. The site gets only its hash: `bash tools/vm/deploy.sh --hash | npx wrangler secret put INGEST_HASH`.
3. The table, once: `npx wrangler d1 migrations apply wraeclast --remote`.
4. `bash tools/vm/deploy.sh` copies the scripts up, sets up the server and starts the timers (`--no-key` keeps the key there).
5. `bash tools/vm/deploy.sh --status` shows the timers and the last log lines. On the server, run one now: `sudo systemctl start wi-market`.
Times (UTC): trade prices :00 (about 55 min), Currency Exchange :07, currency list :25, league dates every 6 h at :40.
