# -*- coding: utf-8 -*-
"""
Temu 台账 vs flow-grow 全店日销量核对脚本

用法:
    python3 reconcile_flowgrow.py <年度台账xlsx> <flowgrow_json> [--output <对账报告.md>]

flowgrow_json 格式:
    {"ok": true, "data": [{"date": "2026-09-10", "num": 94}, ...]}

逻辑:
    1. 从年度台账各月份 sheet 读取「日销量」行（总结行第1行）
    2. 从 flow-grow JSON 读取全店逐日销量
    3. 按日期对齐，输出差异表
    4. 标记差异 >5 件 的日期，以 flow-grow 为准建议修正
"""
import argparse, json, sys
from openpyxl import load_workbook
from datetime import date

def read_ledger_daily(xlsx_path):
    """从年度台账读取全店日销量：{YYYY-MM-DD: 销量}
    直接汇总数据行（5~日销量行-1）的每列和，不依赖公式缓存。"""
    wb = load_workbook(xlsx_path, data_only=False)
    result = {}
    for ws_name in wb.sheetnames:
        if not ws_name.startswith("20"):
            continue
        ws = wb[ws_name]
        # 找日销量行（从下往上找 A 列含"日销量"）
        daily_row = None
        for row in range(ws.max_row, max(1, ws.max_row - 10), -1):
            v = str(ws.cell(row, 1).value or "")
            if "日销量" in v:
                daily_row = row
                break
        if not daily_row:
            continue
        data_end = daily_row - 1
        # L列=12列=1日，AP列=42列=31日
        for day in range(1, 32):
            col = 11 + day
            total = 0
            has_data = False
            for row in range(5, data_end + 1):
                v = ws.cell(row, col).value
                if v and isinstance(v, (int, float)):
                    total += v
                    has_data = True
            if has_data:
                year, month = ws_name.split("-")
                d = date(int(year), int(month), day)
                result[d.isoformat()] = int(total)
    return result

def read_flowgrow(json_path):
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    return {item["date"]: item["num"] for item in data.get("data", [])}

def reconcile(ledger, flowgrow):
    """对比两个字典，输出差异"""
    all_dates = sorted(set(ledger.keys()) | set(flowgrow.keys()))
    diffs = []
    for d in all_dates:
        lv = ledger.get(d)
        fv = flowgrow.get(d)
        if lv is None and fv is None:
            continue
        diff = (fv or 0) - (lv or 0)
        if abs(diff) > 0:
            diffs.append({
                "date": d,
                "ledger": lv,
                "flowgrow": fv,
                "diff": diff,
            })
    return diffs

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ledger_xlsx")
    ap.add_argument("flowgrow_json")
    ap.add_argument("--output", help="输出对账报告 md 路径")
    args = ap.parse_args()

    ledger = read_ledger_daily(args.ledger_xlsx)
    flowgrow = read_flowgrow(args.flowgrow_json)

    print("台账日销量天数: %d" % len(ledger))
    print("flow-grow 日销量天数: %d" % len(flowgrow))

    diffs = reconcile(ledger, flowgrow)
    print("\n差异总数: %d 天" % len(diffs))
    print("\n日期 | 台账 | flow-grow | 差值 | 备注")
    print("-" * 60)
    for d in diffs:
        flag = "⚠️" if abs(d["diff"]) > 5 else ""
        print("%s | %s | %s | %+d | %s" % (
            d["date"], d["ledger"], d["flowgrow"], d["diff"], flag))

    # 输出报告
    if args.output:
        lines = [
            "# Temu 台账 vs flow-grow 全店日销量对账报告\n",
            "## 汇总",
            "- 台账覆盖天数：%d" % len(ledger),
            "- flow-grow 覆盖天数：%d" % len(flowgrow),
            "- 差异天数：%d\n" % len(diffs),
            "## 差异明细",
            "| 日期 | 台账 | flow-grow | 差值 | 备注 |",
            "|---|---|---|---|---|",
        ]
        for d in diffs:
            note = "差异>5件，建议核查" if abs(d["diff"]) > 5 else ""
            lines.append("| %s | %s | %s | %+d | %s |" % (
                d["date"], d["ledger"], d["flowgrow"], d["diff"], note))
        with open(args.output, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print("\n报告已输出: %s" % args.output)

if __name__ == "__main__":
    main()
