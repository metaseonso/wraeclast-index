#!/usr/bin/env bash
# Puts the hourly data jobs on the data server and starts them. Run from Git Bash on Windows:
#   bash tools/vm/deploy.sh             copy the scripts up, set up the server, write the site key
#   bash tools/vm/deploy.sh --no-key    the same, but keep the key already on the server
#   bash tools/vm/deploy.sh --status    the timers, and the last 20 log lines of each job
#   bash tools/vm/deploy.sh --hash      the key's SHA-256, for the site's INGEST_HASH secret
# From WI_SECRETS (default C:/Users/Seonso/Desktop/PoE2Tooling/wi-secrets): the last line of WI_ORACLE_IP.txt
# (the server's address) and of WI_INGEST_KEY.txt (the site key), and the ssh key WI_ORACLE_SSH_KEY (user ubuntu).
# The site key only ever travels through pipes and ssh's stdin: never on a command line, never printed.
set -euo pipefail
S=${WI_SECRETS:-C:/Users/Seonso/Desktop/PoE2Tooling/wi-secrets}
TOOLS=$(cd "$(dirname "$0")/.." && pwd)
last(){ grep -v '^[[:space:]]*$' "$1" | tail -n 1 | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'; }

MODE=deploy
for a in "$@"; do
  case $a in
    --no-key) MODE=nokey ;;
    --status) MODE=status ;;
    --hash) MODE=hash ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

if [ "$MODE" != nokey ] && [ "$MODE" != status ]; then
  [ -s "$S/WI_INGEST_KEY.txt" ] || { echo "no key file: $S/WI_INGEST_KEY.txt" >&2; exit 1; }
fi
if [ "$MODE" = hash ]; then
  last "$S/WI_INGEST_KEY.txt" | tr -d '\n' | sha256sum | cut -c1-64
  exit
fi

[ -s "$S/WI_ORACLE_IP.txt" ] || { echo "no address file: $S/WI_ORACLE_IP.txt" >&2; exit 1; }
IP=$(last "$S/WI_ORACLE_IP.txt")
SSH=(ssh -i "$S/WI_ORACLE_SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "ubuntu@$IP")

if [ "$MODE" = status ]; then
  "${SSH[@]}" 'systemctl list-timers "wi-*" --all --no-pager
    for u in wi-prices wi-exchange wi-market wi-leagues; do
      echo; echo "== $u"; sudo journalctl -u "$u" -n 20 --no-pager -o short-iso
    done'
  exit
fi

echo "Copying the scripts to $IP"
tar -C "$TOOLS" -cf - sitedata.py market.py exchange.py leagues.py pricepull.py -C vm setup.sh |
  "${SSH[@]}" 'rm -rf ~/wi-upload && mkdir -p ~/wi-upload && tar -C ~/wi-upload -xf -'

echo "Setting up the server"
if [ "$MODE" = nokey ]; then
  "${SSH[@]}" 'sudo bash ~/wi-upload/setup.sh'
else
  last "$S/WI_INGEST_KEY.txt" | "${SSH[@]}" 'sudo bash ~/wi-upload/setup.sh --key'
fi
echo "Done. Check on it later with: bash tools/vm/deploy.sh --status"
