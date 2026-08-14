"""One-off / re-runnable job: backfill historical daily close prices for
every company, from --start (default 2026-01-01) through today.

Run from the repo root:
    python scripts/backfill_prices.py [--start 2026-01-01] [--code 7550]

Historical share counts are not available from the free data source, so
backfilled rows use the company's *current* shares_outstanding value and
are flagged "shares_estimated": true. Once real IR-derived share counts
for past dates are known, edit docs/data/prices/{code}.json directly, or
add IR events with scripts/add_ir_event.py and recompute manually.
"""
import argparse
import datetime as dt
import time

import yfinance as yf

from common import load_companies, load_price_history, save_price_history


def backfill_one(company, start, end):
    code = company["code"]
    symbol = company["yahoo_symbol"]
    shares = company.get("shares_outstanding")

    ticker = yf.Ticker(symbol)
    hist = ticker.history(start=start, end=end, interval="1d", auto_adjust=False)
    if hist.empty:
        return 0

    existing = {r["date"]: r for r in load_price_history(code)}
    for row_date, row in hist.iterrows():
        date_str = row_date.strftime("%Y-%m-%d")
        close = round(float(row["Close"]), 2)
        market_cap = round(close * shares) if shares else None
        record = {
            "date": date_str,
            "close": close,
            "shares_outstanding": shares,
            "market_cap": market_cap,
            "source": "backfill",
        }
        if shares:
            record["shares_estimated"] = True
        # Don't clobber a real same-day record already written by fetch_prices.py;
        # do refresh rows we ourselves backfilled earlier (e.g. once shares_outstanding
        # becomes known, so market_cap can be filled in on a re-run).
        if date_str in existing and existing[date_str].get("source") == "daily_fetch":
            continue
        existing[date_str] = record

    save_price_history(code, list(existing.values()))
    return len(hist)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2026-01-01")
    parser.add_argument("--end", default=None, help="defaults to today")
    parser.add_argument("--code", default=None, help="backfill a single company code only")
    args = parser.parse_args()

    end = args.end or (dt.date.today() + dt.timedelta(days=1)).isoformat()

    companies = load_companies()
    if args.code:
        companies = [c for c in companies if c["code"] == args.code]
        if not companies:
            raise SystemExit(f"unknown code: {args.code}")

    for company in companies:
        n = backfill_one(company, args.start, end)
        print(f"{company['code']} {company['name']}: {n} rows")
        time.sleep(0.5)


if __name__ == "__main__":
    main()
