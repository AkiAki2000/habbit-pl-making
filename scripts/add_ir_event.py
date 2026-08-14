"""Append one IR (investor relations) event to a company's IR log.

Example:
    python scripts/add_ir_event.py --code 3563 --date 2026-04-10 \\
        --category 決算 --title "2026年2月期 通期決算を発表" \\
        --url "https://www.foodlife.co.jp/ir/..." \\
        --note "経常利益は前期比+8%"

category is free text; suggested values: 決算 / 業績修正 / 配当 / 株主優待 /
自己株式取得 / 株式分割 / M&A・提携 / その他適時開示
"""
import argparse
import datetime as dt

from common import append_ir_event, load_companies


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--code", required=True)
    parser.add_argument("--date", required=True, help="YYYY-MM-DD")
    parser.add_argument("--category", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--url", default="")
    parser.add_argument("--note", default="")
    args = parser.parse_args()

    dt.date.fromisoformat(args.date)  # validate format early

    codes = {c["code"] for c in load_companies()}
    if args.code not in codes:
        raise SystemExit(f"unknown company code: {args.code}")

    added = append_ir_event(args.code, {
        "date": args.date,
        "category": args.category,
        "title": args.title,
        "url": args.url,
        "note": args.note,
        "source": "manual",
    })
    print("added" if added else "skipped (duplicate date+title)")


if __name__ == "__main__":
    main()
