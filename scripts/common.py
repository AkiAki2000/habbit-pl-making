"""Shared helpers for the stock-tracking scripts.

Layout (all paths relative to the repo root):
  docs/companies.json         master list of tracked companies
  docs/data/prices/{code}.json  daily price / market-cap history for one company
  docs/data/ir/{code}.json      IR (investor relations) event log for one company
  docs/data/status.json         last run timestamp + per-company fetch errors
"""
import json
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS_DIR = os.path.join(REPO_ROOT, "docs")
COMPANIES_PATH = os.path.join(DOCS_DIR, "companies.json")
PRICES_DIR = os.path.join(DOCS_DIR, "data", "prices")
IR_DIR = os.path.join(DOCS_DIR, "data", "ir")
STATUS_PATH = os.path.join(DOCS_DIR, "data", "status.json")


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def load_companies():
    return load_json(COMPANIES_PATH, [])


def save_companies(companies):
    save_json(COMPANIES_PATH, companies)


def price_path(code):
    return os.path.join(PRICES_DIR, f"{code}.json")


def load_price_history(code):
    return load_json(price_path(code), [])


def save_price_history(code, records):
    records = sorted(records, key=lambda r: r["date"])
    save_json(price_path(code), records)


def ir_path(code):
    return os.path.join(IR_DIR, f"{code}.json")


def load_ir_log(code):
    return load_json(ir_path(code), [])


def save_ir_log(code, events):
    events = sorted(events, key=lambda e: e["date"])
    save_json(ir_path(code), events)


def append_ir_event(code, event):
    """Append an IR event, de-duplicating on (date, title)."""
    events = load_ir_log(code)
    key = (event["date"], event["title"])
    if any((e["date"], e["title"]) == key for e in events):
        return False
    events.append(event)
    save_ir_log(code, events)
    return True
