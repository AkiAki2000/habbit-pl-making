"""Daily job (phase 2): scan TDnet's daily listing pages for "決算短信"
(kessan tanshin / earnings summary) disclosures matching our tracked
companies, download the attached XBRL zip, and extract headline KPIs
(net sales, operating income, ordinary income, net income, EPS) from the
Summary inline-XBRL (iXBRL) file into docs/data/kpi/{code}.json.

Run from the repo root:
    python scripts/fetch_earnings_kpi.py [--days 5] [--debug]

Background: TDnet's per-disclosure XBRL zip has no plain .xbrl instance
file -- the facts live as <ix:nonFraction>/<ix:nonNumeric> tags inside
"XBRLData/Summary/*-ixbrl.htm" (Inline XBRL). Concepts use the
"tse-ed-t:" namespace (e.g. tse-ed-t:NetSales). Each concept appears
multiple times under different contextRef values for different periods;
we pick the "current period actual, consolidated" context, which always
looks like "Current...Duration..._ConsolidatedMember_ResultMember"
regardless of whether the filing covers Q1/Q2/Q3/full year (the exact
prefix, e.g. "CurrentAccumulatedQ1Duration" vs "CurrentYearDuration",
varies by filing type, so we match on substrings rather than the full
context name). Falls back to "NonConsolidatedMember" if no consolidated
figure exists (small companies without subsidiaries).
"""
import argparse
import datetime as dt
import re
import time
import urllib.parse
import zipfile
import io

import requests
from bs4 import BeautifulSoup
from lxml import etree

from common import load_companies, load_json, save_json, DOCS_DIR
import os

TDNET_BASE = "https://www.release.tdnet.info/inbs/"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; habbit-pl-making IR tracker)"}
MAX_PAGES_PER_DAY = 20
KPI_DIR = os.path.join(DOCS_DIR, "data", "kpi")

TARGET_CONCEPTS = {
    "net_sales": "tse-ed-t:NetSales",
    "operating_income": "tse-ed-t:OperatingIncome",
    "ordinary_income": "tse-ed-t:OrdinaryIncome",
    "net_income": "tse-ed-t:ProfitAttributableToOwnersOfParent",
    "eps": "tse-ed-t:NetIncomePerShare",
}


def kpi_path(code):
    return os.path.join(KPI_DIR, f"{code}.json")


def load_kpi(code):
    return load_json(kpi_path(code), [])


def save_kpi(code, records):
    records = sorted(records, key=lambda r: (r["date"], r.get("document_name", "")))
    save_json(kpi_path(code), records)


def append_kpi_record(code, record):
    records = load_kpi(code)
    key = (record["date"], record["document_name"])
    if any((r["date"], r["document_name"]) == key for r in records):
        return False
    records.append(record)
    save_kpi(code, records)
    return True


def find_kessan_xbrl_rows(date_str, codes, debug=False):
    """Return list of (code, zip_url) for 決算短信 rows matching our codes on date_str."""
    found = []
    for page in range(1, MAX_PAGES_PER_DAY + 1):
        url = f"{TDNET_BASE}I_list_{page:03d}_{date_str}.html"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20)
        except requests.RequestException:
            break
        resp.encoding = "utf-8"
        if resp.status_code != 200 or not resp.text.strip():
            break
        soup = BeautifulSoup(resp.text, "lxml")
        for row in soup.find_all("tr"):
            # Skip container/wrapper rows that themselves hold nested <tr>s --
            # matching on their flattened text can bleed multiple unrelated
            # disclosures together and misattribute one company's XBRL zip to
            # another. Only consider genuine leaf listing rows.
            if row.find("tr"):
                continue
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            # Row layout: 時刻, コード, 会社名, 表題, [XBRL], 上場取引所, 更新履歴
            code_cell = cells[1].get_text(strip=True)
            title_cell = cells[3].get_text(strip=True)
            if "決算短信" not in title_cell:
                continue
            code = next((c for c in codes if re.fullmatch(rf"{c}0?", code_cell)), None)
            if not code:
                continue
            links = row.find_all("a", href=True)
            xbrl = next((a for a in links if "XBRL" in a.get_text(strip=True)), None)
            if xbrl:
                found.append((code, urllib.parse.urljoin(url, xbrl["href"])))
    if debug and found:
        print(f"  {date_str}: {len(found)} kessan tanshin row(s) with XBRL")
    return found


def parse_facts(html_bytes):
    """Return list of dicts: name, context, unit, scale, sign, value (raw string)."""
    parser = etree.HTMLParser(recover=True, encoding="utf-8")
    tree = etree.fromstring(html_bytes, parser=parser)
    if tree is None:
        return []
    facts = []
    for el in tree.iter():
        if not isinstance(el.tag, str):
            continue
        local = el.tag.rsplit(":", 1)[-1].lower()
        if local not in ("nonfraction", "nonnumeric"):
            continue
        attrs = {k.lower(): v for k, v in el.attrib.items()}
        facts.append({
            "name": attrs.get("name", ""),
            "context": attrs.get("contextref", ""),
            "unit": attrs.get("unitref", ""),
            "scale": attrs.get("scale", ""),
            "sign": attrs.get("sign", ""),
            "value": "".join(el.itertext()).strip(),
        })
    return facts


def numeric_value(fact):
    raw = fact["value"].replace(",", "").strip()
    if not raw:
        return None
    try:
        num = float(raw)
    except ValueError:
        return None
    if fact["sign"] == "-":
        num = -num
    scale = fact["scale"]
    if scale:
        try:
            num *= 10 ** int(scale)
        except ValueError:
            pass
    # Whole-yen / whole-share figures have no fractional part.
    if num == int(num):
        return int(num)
    return num


def is_current_actual(context):
    return context.startswith("Current") and "Duration" in context and "ResultMember" in context


def pick_current_value(facts, concept_name):
    """Prefer a Consolidated current-period-actual fact; fall back to NonConsolidated."""
    candidates = [
        f for f in facts
        if f["name"] == concept_name and is_current_actual(f["context"])
    ]
    consolidated = [f for f in candidates if "NonConsolidatedMember" not in f["context"]
                     and "ConsolidatedMember" in f["context"]]
    pool = consolidated or candidates
    if not pool:
        return None
    return numeric_value(pool[0])


def extract_kpis(facts):
    result = {}
    for key, concept in TARGET_CONCEPTS.items():
        result[key] = pick_current_value(facts, concept)

    def first_value(concept):
        matches = [f for f in facts if f["name"] == concept]
        return matches[0]["value"] if matches else None

    result["fiscal_year_end"] = first_value("tse-ed-t:FiscalYearEnd")
    result["document_name"] = first_value("tse-ed-t:DocumentName")
    return result


def process_zip(zip_bytes, debug=False):
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    summary_files = [n for n in zf.namelist() if "/Summary/" in n and n.lower().endswith(".htm")]
    if not summary_files:
        if debug:
            print("  no Summary ixbrl.htm found in zip")
        return None
    facts = parse_facts(zf.read(summary_files[0]))
    return extract_kpis(facts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=5)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    companies = load_companies()
    codes = [c["code"] for c in companies]
    name_by_code = {c["code"]: c["name"] for c in companies}

    added_total = 0
    for offset in range(args.days):
        day = dt.date.today() - dt.timedelta(days=offset)
        date_str = day.strftime("%Y%m%d")
        rows = find_kessan_xbrl_rows(date_str, codes, debug=args.debug)
        for code, zip_url in rows:
            try:
                resp = requests.get(zip_url, headers=HEADERS, timeout=30)
                if resp.status_code != 200:
                    if args.debug:
                        print(f"  {code}: zip fetch failed ({resp.status_code}) {zip_url}")
                    continue
                kpis = process_zip(resp.content, debug=args.debug)
            except (requests.RequestException, zipfile.BadZipFile) as exc:
                print(f"  {code}: error processing {zip_url}: {exc}")
                continue

            if not kpis or not kpis.get("document_name"):
                if args.debug:
                    print(f"  {code}: no KPI facts extracted from {zip_url}")
                continue

            record = {
                "date": day.isoformat(),
                "document_name": kpis["document_name"],
                "fiscal_year_end": kpis.get("fiscal_year_end"),
                "net_sales": kpis.get("net_sales"),
                "operating_income": kpis.get("operating_income"),
                "ordinary_income": kpis.get("ordinary_income"),
                "net_income": kpis.get("net_income"),
                "eps": kpis.get("eps"),
                "unit": "JPY",
                "url": zip_url,
                "source": "tdnet_xbrl",
            }
            if append_kpi_record(code, record):
                added_total += 1
                print(f"  + {code} {name_by_code.get(code, '')}: {record['document_name']} "
                      f"売上高={record['net_sales']} 営業利益={record['operating_income']} "
                      f"経常利益={record['ordinary_income']} 純利益={record['net_income']} "
                      f"EPS={record['eps']}")
            time.sleep(0.3)

    print(f"done. {added_total} new KPI record(s).")


if __name__ == "__main__":
    main()
