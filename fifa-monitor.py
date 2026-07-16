#!/usr/bin/env python3
"""
FIFA Official Ticket Monitor
Polls tickets.fifa.com and alerts when tickets appear.
Separates: Last Minute Tickets vs Marketplace Tickets.
"""

import time
import json
import os
import subprocess
import sys
import hashlib
import re
import logging
from datetime import datetime
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing deps. Run: pip3 install requests beautifulsoup4")
    sys.exit(1)

BASE_DIR = Path(__file__).parent
CONFIG_FILE = BASE_DIR / "fifa-monitor-config.json"
LOG_FILE    = BASE_DIR / "fifa-monitor.log"
STATE_FILE  = BASE_DIR / "fifa-monitor-state.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger("fifa-monitor")


def mac_notify(title: str, message: str, sound: str = "Ping"):
    script = (
        f'display notification "{message}" '
        f'with title "{title}" '
        f'subtitle "FIFA Ticket Monitor" '
        f'sound name "{sound}"'
    )
    subprocess.run(["osascript", "-e", script], capture_output=True)


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        default = {
            "check_interval_seconds": 120,
            "matches": [
                {
                    "label": "Example: Brazil vs Argentina",
                    "tournament": "FIFA Club World Cup 2025",
                    "keywords": ["brazil", "argentina"],
                    "url": "https://tickets.fifa.com/"
                }
            ]
        }
        CONFIG_FILE.write_text(json.dumps(default, indent=2))
        log.info(f"Created default config: {CONFIG_FILE}")
    return json.loads(CONFIG_FILE.read_text())


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

LAST_MINUTE_PATTERNS = [
    r"last[\s\-]?minute",
    r"last[\s\-]?chance",
    r"limited[\s\-]?availability",
    r"few[\s\-]?remaining",
    r"final[\s\-]?release",
    r"flash[\s\-]?sale",
]

MARKETPLACE_PATTERNS = [
    r"marketplace",
    r"resale",
    r"fan[\s\-]?to[\s\-]?fan",
    r"secondary",
    r"transfer",
]

AVAILABLE_PATTERNS = [
    r"buy[\s\-]now",
    r"add[\s\-]to[\s\-]cart",
    r"available",
    r"on[\s\-]sale",
    r"purchase",
    r"select[\s\-]tickets",
]

SOLD_OUT_PATTERNS = [
    r"sold[\s\-]?out",
    r"not[\s\-]available",
    r"unavailable",
    r"waitlist",
]


def classify_ticket_block(text: str) -> str:
    """Return 'last_minute', 'marketplace', or 'standard'."""
    t = text.lower()
    for p in LAST_MINUTE_PATTERNS:
        if re.search(p, t):
            return "last_minute"
    for p in MARKETPLACE_PATTERNS:
        if re.search(p, t):
            return "marketplace"
    return "standard"


def is_available(text: str) -> bool:
    t = text.lower()
    for p in SOLD_OUT_PATTERNS:
        if re.search(p, t):
            return False
    for p in AVAILABLE_PATTERNS:
        if re.search(p, t):
            return True
    return False


def check_match(match: dict, session: requests.Session) -> dict:
    """
    Fetch the FIFA ticket page and look for this match's tickets.
    Returns dict with keys: last_minute, marketplace, standard, raw_hash
    """
    url = match.get("url", "https://tickets.fifa.com/")
    keywords = [k.lower() for k in match.get("keywords", [])]

    result = {
        "last_minute": [],
        "marketplace": [],
        "standard": [],
        "raw_hash": None,
        "error": None,
        "url": url,
    }

    try:
        resp = session.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
    except requests.RequestException as e:
        result["error"] = str(e)
        return result

    raw_hash = hashlib.md5(resp.text.encode()).hexdigest()
    result["raw_hash"] = raw_hash

    soup = BeautifulSoup(resp.text, "html.parser")

    # Try structured ticket blocks first
    ticket_blocks = (
        soup.select("[class*='ticket']") or
        soup.select("[class*='match']") or
        soup.select("[class*='event']") or
        soup.select("article") or
        soup.select("section") or
        []
    )

    if not ticket_blocks:
        # Fall back to scanning all text
        full_text = soup.get_text(" ", strip=True)
        ticket_blocks = [soup]

    for block in ticket_blocks:
        text = block.get_text(" ", strip=True)
        if not text:
            continue

        # Check if this block mentions our match
        text_lower = text.lower()
        if keywords and not any(kw in text_lower for kw in keywords):
            continue

        if not is_available(text):
            continue

        category = classify_ticket_block(text)
        snippet = text[:200].strip()

        entry = {"snippet": snippet, "block_text": text[:500]}
        result[category].append(entry)

    return result


def build_alert_message(match: dict, found: dict) -> tuple[str, str]:
    """Returns (title, body) for the notification."""
    label = match["label"]
    parts = []
    if found["last_minute"]:
        parts.append(f"⚡ LAST MINUTE: {len(found['last_minute'])} listing(s)")
    if found["marketplace"]:
        parts.append(f"🔄 MARKETPLACE: {len(found['marketplace'])} listing(s)")
    if found["standard"]:
        parts.append(f"🎟 STANDARD: {len(found['standard'])} listing(s)")
    body = " | ".join(parts) if parts else "Tickets found!"
    title = f"FIFA TICKETS AVAILABLE — {label}"
    return title, body


def run():
    config = load_config()
    state  = load_state()
    interval = config.get("check_interval_seconds", 120)
    matches  = config.get("matches", [])

    if not matches:
        log.error("No matches configured. Edit fifa-monitor-config.json")
        sys.exit(1)

    log.info("=" * 60)
    log.info("FIFA TICKET MONITOR STARTED")
    log.info(f"Watching {len(matches)} match(es) | Interval: {interval}s")
    for m in matches:
        log.info(f"  • {m['label']} — {m['url']}")
    log.info("=" * 60)

    session = requests.Session()

    while True:
        for match in matches:
            label = match["label"]
            log.info(f"Checking: {label}")

            found = check_match(match, session)

            if found["error"]:
                log.warning(f"  Error fetching {found['url']}: {found['error']}")
                continue

            prev_hash = state.get(label, {}).get("raw_hash")
            page_changed = found["raw_hash"] != prev_hash

            has_tickets = bool(found["last_minute"] or found["marketplace"] or found["standard"])
            was_available = state.get(label, {}).get("had_tickets", False)

            if has_tickets:
                if not was_available or page_changed:
                    title, body = build_alert_message(match, found)
                    log.info(f"  *** TICKETS FOUND *** {body}")
                    mac_notify(title, body, sound="Ping")

                    if found["last_minute"]:
                        mac_notify(
                            f"⚡ LAST MINUTE TICKETS — {label}",
                            f"{len(found['last_minute'])} last-minute listing(s) just appeared!",
                            sound="Sosumi"
                        )
                    if found["marketplace"]:
                        mac_notify(
                            f"🔄 MARKETPLACE TICKETS — {label}",
                            f"{len(found['marketplace'])} marketplace listing(s) available!",
                            sound="Ping"
                        )
                else:
                    log.info(f"  Tickets still available (no change)")
            else:
                log.info(f"  No tickets found (sold out / not on sale)")
                if was_available:
                    log.info(f"  Tickets were available before — now gone")

            state[label] = {
                "raw_hash": found["raw_hash"],
                "had_tickets": has_tickets,
                "last_checked": datetime.now().isoformat(),
                "last_minute_count": len(found["last_minute"]),
                "marketplace_count": len(found["marketplace"]),
                "standard_count": len(found["standard"]),
            }
            save_state(state)

        log.info(f"Sleeping {interval}s until next check...")
        time.sleep(interval)


if __name__ == "__main__":
    run()
