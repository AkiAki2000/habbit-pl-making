"""Daily job: scan TDnet's (Tokyo Stock Exchange timely-disclosure archive)
daily listing pages for the last --days days, and auto-record any new
disclosure whose text mentions one of our tracked company codes into
that company's IR log (title + date + PDF link only; no content parsing
yet -- that's a later phase).

Run from the repo root:
    python scripts/fetch_ir.py [--days 5] [--debug]

TDnet has no official per-company API, so this scrapes the public daily
list pages at https://www.release.tdnet.info/inbs/I_list_NNN_YYYYMMDD.html
(page NNN, date YYYYMMDD), trying page numbers upward until a page fails
to load. This is inherently a bit fragile -- if TDnet changes its HTML,
matches may silently drop to zero. Run with --debug to print diagnostics
(page counts, a raw HTML snippet, per-company match counts) for
troubleshooting via the GitHub Actions job log.
"""
import argparse
import datetime as dt
import re
import sys
import time
import urllib.parse

import requests
from bs4 import BeautifulSoup

from common import append_ir_event, load_companies

TDNET_BASE = "https://www.release.tdnet.info/inbs/"
MAX_PAGES_PER_DAY = 20
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; habbit-pl-making IR tracker)"}

CATEGORY_RULES = [
    ("決算短信", "決算"),
    ("決算説明", "決算"),
    ("業績予想", "業績修正"),
    ("業績の修正", "業績修正"),
    ("配当", "配当"),
    ("自己株式", "自己株式取得"),
    ("株式分割", "株式分割"),
    ("株主優待", "株主優待"),
    ("月次", "月次売上"),
    ("既存店", "月次売上"),
    ("業務提携", "M&A・提携"),
    ("合併", "M&A・提携"),
    ("子会社", "M&A・提携"),
]


def categorize(title):
    for keyword, category in CATEGORY_RULES:
        if keyword in title:
            return category
    return "その他適時開示"


def fetch_page(date_str, page, debug=False):
    url = f"{TDNET_BASE}I_list_{page:03d}_{date_str}.html"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
    except requests.RequestException as exc:
        if debug:
            print(f"  [debug] {url} -> request error: {exc}")
        return None
    # TDnet's pages are UTF-8 (declared via <meta charset> only, not the HTTP
    # header), so requests' default header-based encoding detection falls back
    # to ISO-8859-1 and mangles every non-ASCII character. Force UTF-8.
    resp.encoding = "utf-8"
    if resp.status_code != 200 or not resp.text.strip():
        if debug:
            print(f"  [debug] {url} -> status {resp.status_code}, len {len(resp.text)}")
        return None
    return url, resp.text


def parse_matches(url, html, codes, debug=False):
    soup = BeautifulSoup(html, "lxml")
    rows = soup.find_all("tr")
    if debug:
        print(f"  [debug] {url}: {len(rows)} <tr> rows found")
    matches = []
    for row in rows:
        text = row.get_text(" ", strip=True)
        if not text:
            continue
        for code in codes:
            if re.search(rf"(?<!\d){code}(?!\d)", text):
                link_tag = row.find("a", href=True)
                link = urllib.parse.urljoin(url, link_tag["href"]) if link_tag else ""
                title = link_tag.get_text(strip=True) if link_tag else text
                matches.append((code, title, link, text))
    return matches


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=5)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    companies = load_companies()
    codes = [c["code"] for c in companies]
    name_by_code = {c["code"]: c["name"] for c in companies}

    added_total = 0
    seen_debug_snippet = False

    for offset in range(args.days):
        day = dt.date.today() - dt.timedelta(days=offset)
        date_str = day.strftime("%Y%m%d")
        print(f"scanning {date_str} ...")
        for page in range(1, MAX_PAGES_PER_DAY + 1):
            result = fetch_page(date_str, page, debug=args.debug)
            if result is None:
                break
            url, html = result
            matches = parse_matches(url, html, codes, debug=args.debug)

            if args.debug and not seen_debug_snippet and html.count("<tr") > 20:
                # Print a page that actually has real disclosure rows (a
                # near-empty "no disclosures today" page isn't useful here).
                print(f"  [debug] snippet of a real listing page ({url}):")
                soup = BeautifulSoup(html, "lxml")
                rows = soup.find_all("tr")
                for row in rows[:15]:
                    print("  [debug row]", repr(row.get_text(" ", strip=True))[:300])
                    for a in row.find_all("a", href=True):
                        print("    [debug link]", a["href"], repr(a.get_text(strip=True))[:120])
                seen_debug_snippet = True
            for code, title, link, raw_text in matches:
                event = {
                    "date": day.isoformat(),
                    "category": categorize(title),
                    "title": title or raw_text[:120],
                    "url": link,
                    "note": "",
                    "source": "tdnet_auto",
                }
                if append_ir_event(code, event):
                    added_total += 1
                    print(f"  + {code} {name_by_code.get(code, '')}: {event['title']}")
            time.sleep(0.3)

    print(f"done. {added_total} new IR event(s) recorded.")
    if added_total == 0 and args.debug:
        print("no matches at all -- if TDnet pages loaded successfully above, "
              "the HTML structure this script expects may be wrong and needs adjusting.")
    sys.exit(0)


if __name__ == "__main__":
    main()
