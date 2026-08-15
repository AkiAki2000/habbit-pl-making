"""One-off diagnostic (not part of the daily pipeline): find the most recent
"決算短信" (kessan tanshin / quarterly earnings) disclosure for one of our
tracked companies, download its XBRL zip from TDnet, and print out what's
inside -- file listing, and every distinct XBRL element (tag local-name)
found in each XML file, with a sample value.

This exists purely to let us see real TDnet XBRL structure via GitHub
Actions logs (this dev sandbox can't reach TDnet directly), so we can then
write a real extractor against real tag names instead of guessing.

Usage:
    python scripts/inspect_xbrl.py [--days 10] [--code 7550]
"""
import argparse
import datetime as dt
import re
import urllib.parse
import zipfile
import io

import requests
from bs4 import BeautifulSoup
from lxml import etree

from common import load_companies

TDNET_BASE = "https://www.release.tdnet.info/inbs/"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; habbit-pl-making IR tracker)"}


def find_kessan_xbrl(date_str, codes):
    found = []
    for page in range(1, 21):
        url = f"{TDNET_BASE}I_list_{page:03d}_{date_str}.html"
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.encoding = "utf-8"
        if resp.status_code != 200 or not resp.text.strip():
            break
        soup = BeautifulSoup(resp.text, "lxml")
        for row in soup.find_all("tr"):
            text = row.get_text(" ", strip=True)
            if "決算短信" not in text:
                continue
            for code in codes:
                if re.search(rf"(?<!\d){code}0?(?!\d)", text):
                    links = row.find_all("a", href=True)
                    xbrl = next((a for a in links if "XBRL" in a.get_text(strip=True)), None)
                    if xbrl:
                        found.append((code, text, urllib.parse.urljoin(url, xbrl["href"])))
    return found


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=10)
    parser.add_argument("--code", default=None)
    args = parser.parse_args()

    companies = load_companies()
    codes = [c["code"] for c in companies]
    if args.code:
        codes = [args.code]

    hit = None
    for offset in range(args.days):
        day = dt.date.today() - dt.timedelta(days=offset)
        date_str = day.strftime("%Y%m%d")
        results = find_kessan_xbrl(date_str, codes)
        if results:
            print(f"{date_str}: {len(results)} kessan-tanshin-with-XBRL row(s) found")
            for code, text, zip_url in results:
                print(f"  {code}: {text[:80]}")
                print(f"    zip: {zip_url}")
            if hit is None:
                hit = results[0]
        if hit and offset > 0:
            break

    if not hit:
        print("no kessan tanshin with XBRL found in range")
        return

    code, text, zip_url = hit
    print(f"\ninspecting zip for code {code}: {zip_url}")
    resp = requests.get(zip_url, headers=HEADERS, timeout=30)
    print(f"status={resp.status_code} content-length={len(resp.content)}")

    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = zf.namelist()
    print(f"\n{len(names)} files in zip:")
    for n in names:
        print(f"  {n}")

    # The real facts live in Inline XBRL (iXBRL) .htm files, tagged with
    # <ix:nonFraction name="...:Concept" contextRef="..." ...>value</ix:nonFraction>.
    # Focus on the Summary file first -- it's the short headline-KPI version.
    summary_files = [n for n in names if "/Summary/" in n and n.lower().endswith(".htm")]
    other_htm = [n for n in names if n.lower().endswith(".htm") and n not in summary_files]
    target_files = summary_files + other_htm[:1]  # peek at one attachment file too

    for n in target_files:
        print(f"\n=== ix:nonFraction / ix:nonNumeric facts in {n} ===")
        data = zf.read(n)
        parser = etree.HTMLParser(recover=True, encoding="utf-8")
        tree = etree.fromstring(data, parser=parser)
        if tree is None:
            print("  (failed to parse)")
            continue
        count = 0
        for el in tree.iter():
            if not isinstance(el.tag, str):
                continue
            # lxml's HTML parser isn't namespace-aware, so el.tag is a plain
            # (lower-cased) string like "ix:nonfraction" -- etree.QName() chokes
            # on that. Just split on ':' ourselves.
            local = el.tag.rsplit(":", 1)[-1].lower()
            if local not in ("nonfraction", "nonnumeric"):
                continue
            # HTML parsing also lower-cases attribute names (contextRef -> contextref).
            attrs = {k.lower(): v for k, v in el.attrib.items()}
            name = attrs.get("name", "")
            context = attrs.get("contextref", "")
            unit = attrs.get("unitref", "")
            scale = attrs.get("scale", "")
            sign = attrs.get("sign", "")
            val = "".join(el.itertext()).strip()
            if count < 150:
                print(f"  name={name} context={context} unit={unit} scale={scale} sign={sign} value={val!r}")
            count += 1
        print(f"  ({count} facts total)")


if __name__ == "__main__":
    main()
