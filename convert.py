#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
题库 Excel → JS 数据 转换脚本（一次性）
读取 /Volumes/driver/opdir/memory/2026-06-23/题库.xlsx
输出 questions.js：单选 + 多选 两份题目数据
"""

import json
import openpyxl
from pathlib import Path

SRC = Path('/Volumes/driver/opdir/memory/2026-06-23/题库.xlsx')
OUT = Path(__file__).parent / 'questions.js'

OPTION_SEP = '$;$'

def normalize(s):
    """统一处理空值，返回空字符串"""
    if s is None:
        return ''
    return str(s).strip()

def parse_options(opts_raw):
    """按 $;$ 分割选项，返回 [A, B, C, D]"""
    if not opts_raw:
        return []
    return [o.strip() for o in opts_raw.split(OPTION_SEP) if o.strip()]

def parse_answer(ans_raw):
    """答案字母列表，单选 = ['B']，多选 = ['A','B','C']"""
    if not ans_raw:
        return []
    s = str(ans_raw).strip().upper()
    # 支持 "ABC" / "A,B,C" / "A;B;C" 多种写法
    for sep in [',', ';', '、', ' ']:
        if sep in s:
            return [c.strip() for c in s.split(sep) if c.strip() in 'ABCDEF']
    return [c for c in s if c in 'ABCDEF']

def load_sheet(wb, sheet_name, qtype):
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))[1:]  # 跳表头
    questions = []
    bad = 0
    for r in rows:
        idx, _qtype, q_text, opts_raw, ans_raw = r[0], r[1], r[2], r[3], r[4]
        q_text = normalize(q_text)
        opts = parse_options(opts_raw)
        ans = parse_answer(ans_raw)

        if not q_text or not opts or not ans:
            bad += 1
            continue

        # 容错：答案字母必须在选项范围内
        ans = [c for c in ans if ord(c) - ord('A') < len(opts)]

        if not ans:
            bad += 1
            continue

        questions.append({
            'id': int(idx) if idx is not None else len(questions) + 1,
            'type': qtype,
            'q': q_text,
            'opts': opts,
            'ans': ans,
        })

    print(f"[{sheet_name}] 有效 {len(questions)} 道, 跳过 {bad} 道异常")
    return questions

def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    single = load_sheet(wb, '单选题', 'single')
    multi = load_sheet(wb, '多选题', 'multi')

    payload = {
        'single': single,
        'multi': multi,
        'meta': {
            'name': '刷题先锋 1.0',
            'singleCount': len(single),
            'multiCount': len(multi),
            'generatedAt': '2026-06-23',
        }
    }

    js = 'window.QUESTION_BANK = ' + json.dumps(payload, ensure_ascii=False) + ';\n'
    OUT.write_text(js, encoding='utf-8')

    size_kb = OUT.stat().st_size / 1024
    print(f"\n✓ 写入 {OUT} ({size_kb:.1f} KB)")
    print(f"  单选 {len(single)} + 多选 {len(multi)} = {len(single)+len(multi)} 题")

if __name__ == '__main__':
    main()