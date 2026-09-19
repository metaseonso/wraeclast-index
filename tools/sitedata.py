"""Where the hourly jobs (market.py, exchange.py, leagues.py, pricepull.py) keep their files, and how they send
them to the site.

  no WI_DATA_DIR    a repo checkout (GitHub Actions, or by hand): files live in data/, as always
  WI_DATA_DIR=dir   the data server (tools/vm/): files live in dir. Site files a job reads but does not make
                    (index.json, trade.json, ...) come from the live site and are kept there, refreshed every 6 hours.
  WI_INGEST_KEY     each finished file is also sent to the site (POST /api/data/put), signed with this key
  WI_SITE           the site (default https://wraeclastindex.fyi)
"""
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER = bool(os.environ.get('WI_DATA_DIR'))
DATA = Path(os.environ['WI_DATA_DIR']) if SERVER else ROOT / 'data'
SITE = (os.environ.get('WI_SITE') or 'https://wraeclastindex.fyi').rstrip('/')
KEY = (os.environ.get('WI_INGEST_KEY') or '').strip()
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
FRESH = 6 * 3600   # seconds before a kept site file is fetched again


def get(url, timeout=60):
    """A file from the web, as bytes."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
        return gzip.decompress(body) if r.headers.get('Content-Encoding') == 'gzip' else body


def save(path, text):
    """Write a file in one step (a job reading it never sees half a file)."""
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_bytes(text.encode('utf-8'))
    os.replace(tmp, path)


def site_file(name, required=True):
    """A data file the site ships (index.json, trade.json, info.json, pricejobs.json, farmqueries.json), parsed."""
    p = DATA / name
    if SERVER and (not p.exists() or time.time() - p.stat().st_mtime > FRESH):
        try:
            body = get(SITE + '/data/' + name)
            json.loads(body)
            save(p, body.decode('utf-8'))
        except Exception as e:   # keep using the copy already here
            print('  could not fetch', name, e, file=sys.stderr)
    if not p.exists():
        if required:
            sys.exit('missing ' + str(p))
        return None
    return json.loads(p.read_text(encoding='utf-8'))


def latest(name):
    """A file a job here makes (market.json, from market.py), parsed. On the data server before that job's first
    run: the live site's copy."""
    p = DATA / name
    if p.exists() or not SERVER:
        return json.loads(p.read_text(encoding='utf-8'))
    return json.loads(get(SITE + '/data/' + name))


def publish(name, data):
    """Write a finished file, and send it to the site when WI_INGEST_KEY is set."""
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    save(DATA / name, text)
    if not KEY:
        return
    req = urllib.request.Request(SITE + '/api/data/put?name=' + urllib.parse.quote(name), data=text.encode('utf-8'), method='POST',
                                 headers={'User-Agent': UA, 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                print('  sent', name, json.load(r))
                return
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == 2:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
        time.sleep(10 * (attempt + 1))
