#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
题库 Excel → JS 数据 转换脚本（一次性）
多题库 dict 格式：{ banks: { code: { name, single, multi, judge } }, current: code }
"""

import json
import openpyxl
from pathlib import Path

# ============== 多题库配置（加新题库就这里加一行）==============
BANKS_CONFIG = [
    {
        'code': 'power-ai-202606',
        'name': '电力人工智能题库202606',
        'src': '/Volumes/driver/opdir/memory/2026-06-23/题库.xlsx',
        'sheets': {
            'single': '单选题',
            'multi': '多选题',
            # 'judge': '判断题',  # 暂时没数据，加题时去掉注释
        }
    },
    # === 加新题库示例 ===
    # {
    #     'code': 'another-bank-202607',
    #     'name': '另一题库202607',
    #     'src': '/path/to/another.xlsx',
    #     'sheets': {
    #         'single': '单选',
    #         'multi': '多选',
    #         'judge': '判断',
    #     }
    # },
]

OUT = Path(__file__).parent / 'questions.js'
OPTION_SEP = '$;$'

# 判断题固定选项 + 答案映射
JUDGE_OPTS = ['正确', '错误']
JUDGE_ANSWER_MAP = {
    # 答案列原文 → 选项字母
    'A': 'A', 'B': 'B', 'T': 'A', 'F': 'B',
    'TRUE': 'A', 'FALSE': 'B',
    '对': 'A', '错': 'B',
    '正确': 'A', '错误': 'B',
    '是': 'A', '否': 'B',
    '√': 'A', '×': 'B',
    '✓': 'A', '✗': 'B',
}


def normalize(s):
    if s is None:
        return ''
    return str(s).strip()


def parse_options(opts_raw, qtype='single'):
    """按 $;$ 分割选项"""
    if not opts_raw:
        return []
    return [o.strip() for o in opts_raw.split(OPTION_SEP) if o.strip()]


def parse_answer(ans_raw, qtype='single'):
    """答案字母列表
    - single/multi: ['B'] 或 ['A','B','C']
    - judge: ['A']=正确 / ['B']=错误（兼容多种写法）
    """
    if not ans_raw:
        return []
    s = str(ans_raw).strip()

    if qtype == 'judge':
        # 判断题：直接查映射表
        return [JUDGE_ANSWER_MAP[s.upper()]] if s.upper() in JUDGE_ANSWER_MAP else []

    # single/multi：支持 "ABC" / "A,B,C" / "A;B;C" 等
    s_upper = s.upper()
    for sep in [',', ';', '、', ' ']:
        if sep in s_upper:
            return [c.strip() for c in s_upper.split(sep) if c.strip() in 'ABCDEF']
    return [c for c in s_upper if c in 'ABCDEF']


def load_sheet(wb, sheet_name, qtype):
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))[1:]  # 跳表头
    questions = []
    bad = 0
    for r in rows:
        idx, _qtype, q_text, opts_raw, ans_raw = r[0], r[1], r[2], r[3], r[4]
        q_text = normalize(q_text)
        # 判断题固定选项，单选/多选从 Excel 读
        if qtype == 'judge':
            opts = list(JUDGE_OPTS)
        else:
            opts = parse_options(opts_raw, qtype)
        ans = parse_answer(ans_raw, qtype)

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


def load_bank(cfg):
    wb = openpyxl.load_workbook(cfg['src'], data_only=True)
    bank = {
        'name': cfg['name'],
        'single': [],
        'multi': [],
        'judge': [],
    }
    for qtype, sheet_name in cfg['sheets'].items():
        if qtype in bank:
            bank[qtype] = load_sheet(wb, sheet_name, qtype)
    return bank


def main():
    banks = {}
    for cfg in BANKS_CONFIG:
        print(f"\n=== 加载题库: {cfg['code']} ({cfg['name']}) ===")
        banks[cfg['code']] = load_bank(cfg)

    payload = {
        'banks': banks,
        'current': BANKS_CONFIG[0]['code'],
    }

    js = 'window.QUESTION_BANKS = ' + json.dumps(payload, ensure_ascii=False) + ';\n'
    OUT.write_text(js, encoding='utf-8')

    total_questions = sum(
        len(bank.get(t, []))
        for bank in banks.values()
        for t in ('single', 'multi', 'judge')
    )
    size_kb = OUT.stat().st_size / 1024
    print(f"\n✓ 写入 {OUT} ({size_kb:.1f} KB)")
    print(f"  共 {len(banks)} 个题库, {total_questions} 道题")
    for code, bank in banks.items():
        print(f"  - {code} ({bank['name']}): 单选 {len(bank['single'])} / 多选 {len(bank['multi'])} / 判断 {len(bank['judge'])}")


if __name__ == '__main__':
    main()