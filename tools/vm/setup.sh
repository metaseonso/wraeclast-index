#!/usr/bin/env bash
# Sets up the data server (Ubuntu 24.04) for the hourly data jobs. Safe to run again. deploy.sh runs it:
#   sudo bash setup.sh          the scripts in this folder go to /opt/wi, the timers go on
#   sudo bash setup.sh --key    the same, and the site key (one line on stdin) goes into /etc/wi/env
# The jobs run as the user wi, keep their files in /var/lib/wi, and only make outbound calls.
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" -eq 0 ] || { echo 'run it with sudo' >&2; exit 1; }

KEY=
if [ "${1:-}" = --key ]; then
  IFS= read -r KEY || true
  exec </dev/null   # nothing below can read the key by accident
  [[ $KEY =~ ^[A-Za-z0-9._~+/=-]{16,512}$ ]] || { echo 'the key is missing or has odd characters' >&2; exit 1; }
fi

# the system: UTC, Python, security updates on their own
timedatectl set-timezone UTC
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q python3 ca-certificates unattended-upgrades
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades.service apt-daily.timer apt-daily-upgrade.timer

# the user the jobs run as, the scripts, their files
id -u wi >/dev/null 2>&1 || useradd --system --home-dir /var/lib/wi --no-create-home --shell /usr/sbin/nologin wi
install -d -m 755 /opt/wi
install -d -o wi -g wi -m 750 /var/lib/wi
install -d -m 755 /etc/wi
install -m 644 sitedata.py market.py exchange.py leagues.py pricepull.py /opt/wi/

# the settings the jobs read: WI_DATA_DIR always, WI_INGEST_KEY when given (printf is built in: the key is never on a command line)
if [ -n "$KEY" ]; then
  (umask 077; printf 'WI_INGEST_KEY=%s\nWI_DATA_DIR=/var/lib/wi\n' "$KEY" > /etc/wi/env.new)
  mv -f /etc/wi/env.new /etc/wi/env
elif [ ! -f /etc/wi/env ]; then
  printf 'WI_DATA_DIR=/var/lib/wi\n' > /etc/wi/env
fi
chown wi:wi /etc/wi/env
chmod 600 /etc/wi/env

# one job: unit <name> <script> <when> <time limit> <random delay> <what>
# A job still running when its timer comes round again is left alone (systemd never runs one unit twice at once).
unit(){
  cat > "/etc/systemd/system/$1.service" <<EOF
[Unit]
Description=Wraeclast Index: $6
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=wi
Group=wi
EnvironmentFile=/etc/wi/env
Environment=PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WorkingDirectory=/var/lib/wi
ExecStart=/usr/bin/python3 /opt/wi/$2
TimeoutStartSec=$4
Nice=10
MemoryMax=400M
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/wi
EOF
  cat > "/etc/systemd/system/$1.timer" <<EOF
[Unit]
Description=Wraeclast Index: $6, on a timer

[Timer]
OnCalendar=$3
Persistent=true
RandomizedDelaySec=$5
AccuracySec=1s

[Install]
WantedBy=timers.target
EOF
}
# spread through the hour; trade prices pace themselves over ~55 minutes and must end before the next :00
unit wi-prices   pricepull.py '*-*-* *:00:00'    58min 30 'trade prices'
unit wi-exchange exchange.py  '*-*-* *:07:00'    30min 60 'Currency Exchange prices'
unit wi-market   market.py    '*-*-* *:25:00'    20min 60 'currency list'
unit wi-leagues  leagues.py   '*-*-* 00/6:40:00' 5min  60 'league dates'
systemctl daemon-reload
systemctl enable --now wi-prices.timer wi-exchange.timer wi-market.timer wi-leagues.timer
systemctl list-timers 'wi-*' --no-pager
