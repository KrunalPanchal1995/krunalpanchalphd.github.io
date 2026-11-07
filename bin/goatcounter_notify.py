#!/usr/bin/env python
"""B3 (GOAL_SCORECARD.md, session 4): polls GoatCounter's stats API for new
page-view activity and notifies when a visit happens -- goal.md's "if any
one visits my page notif me" ask.

Two real inputs this script needs that this session did NOT have and did
NOT guess at:
  1. GOATCOUNTER_API_KEY -- an API token from your GoatCounter account
     (Settings -> API, https://www.goatcounter.com/help/api). Read from the
     environment, never hardcoded or committed.
  2. A notification channel. goal.md doesn't say HOW you want to be
     notified (email? Slack? a desktop notification?), and guessing one
     (e.g. assuming SMTP credentials exist) would be fabricating a working
     integration that isn't actually wired to anything. `notify()` below
     defaults to printing to stdout -- always works, safe to run right now
     -- with the two most likely real integrations sketched (commented out)
     so wiring one in is a few-line change, not a redesign.

Uses site.goatcounter_code from _config.yml as the site identifier (the
SAME code the page-view script in goatcounter.liquid uses), so there is
exactly one place the site code is configured, not two.

State: the highest total view count seen so far is kept in
`bin/.goatcounter_notify_state.json` (gitignored) -- a fresh checkout starts
from 0, so the very first run will report "new" views for everything
GoatCounter has ever recorded. That's expected, not a bug: run it once to
prime the state file before relying on it for real alerts.

Usage:
    GOATCOUNTER_API_KEY=xxxx python bin/goatcounter_notify.py [--dry-run]

Intended to run on a schedule (cron, a GitHub Actions workflow on a
schedule trigger, ...) -- this script itself does not loop or sleep.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

import yaml

STATE_FILE = Path(__file__).resolve().parent / ".goatcounter_notify_state.json"
CONFIG_FILE = Path(__file__).resolve().parent.parent / "_config.yml"


def load_goatcounter_code() -> str:
    if not CONFIG_FILE.exists():
        print(f"{CONFIG_FILE} not found.", file=sys.stderr)
        sys.exit(1)
    with open(CONFIG_FILE) as f:
        config = yaml.safe_load(f)
    code = config.get("goatcounter_code")
    if not code:
        print(
            "goatcounter_code is not set in _config.yml -- set it to your GoatCounter "
            "site code first (see goatcounter.liquid's own comment for how to get one).",
            file=sys.stderr,
        )
        sys.exit(1)
    return code


def load_state() -> dict:
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"last_seen_total": 0}


def save_state(state: dict) -> None:
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def fetch_total_views(site_code: str, api_key: str) -> int:
    """GoatCounter API v0: GET /api/v0/stats/total, Bearer auth -- returns
    {"count": N, "count_unique": M, ...} for all-time totals. Documented at
    https://www.goatcounter.com/help/api. NOT exercised against a live
    account this session (no API key available) -- the request shape is
    correct per GoatCounter's published API, but this function's real
    behavior against a live site is unverified; test it with a real key
    before relying on it."""
    url = f"https://{site_code}.goatcounter.com/api/v0/stats/total"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = json.loads(resp.read())
    return int(body["count"])


def notify(message: str) -> None:
    """Default: print to stdout -- always works, no external dependency.
    Pick ONE real channel and replace this body once you've decided:

        # Email (needs SMTP_HOST/SMTP_USER/SMTP_PASS/NOTIFY_EMAIL env vars):
        # import smtplib
        # from email.message import EmailMessage
        # msg = EmailMessage(); msg["Subject"] = "New site visit"; msg.set_content(message)
        # msg["From"] = msg["To"] = os.environ["NOTIFY_EMAIL"]
        # with smtplib.SMTP_SSL(os.environ["SMTP_HOST"]) as s:
        #     s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"]); s.send_message(msg)

        # A webhook (Slack incoming webhook, ntfy.sh, etc. -- WEBHOOK_URL env var):
        # import urllib.request
        # req = urllib.request.Request(os.environ["WEBHOOK_URL"],
        #     data=json.dumps({"text": message}).encode(), headers={"Content-Type": "application/json"})
        # urllib.request.urlopen(req, timeout=15)
    """
    print(message)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                         help="fetch and compare, but don't update the state file")
    args = parser.parse_args()

    api_key = os.environ.get("GOATCOUNTER_API_KEY")
    if not api_key:
        print("GOATCOUNTER_API_KEY is not set.", file=sys.stderr)
        return 1

    site_code = load_goatcounter_code()
    state = load_state()

    try:
        total = fetch_total_views(site_code, api_key)
    except Exception as e:
        print(f"Failed to fetch GoatCounter stats: {e}", file=sys.stderr)
        return 1

    new_views = total - state["last_seen_total"]
    if new_views > 0:
        notify(f"{new_views} new view(s) on {site_code}.goatcounter.com "
               f"(total {total}, was {state['last_seen_total']})")
    if not args.dry_run:
        state["last_seen_total"] = total
        save_state(state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
