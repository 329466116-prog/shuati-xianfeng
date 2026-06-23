#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 PDF 提取的 questions_pdf2.json 转换为 questions.js 格式
合并到现有 BANKS dict，新增 'driver-license-202606' 题库
"""
import json
from pathlib import Path
import re

SRC = Path('/Volumes/driver/opdir/memory/2026-06-23/questions_pdf2.json')
OUT = Path('/Volumes/driver/opdir/projects/shuati-xianfeng/questions.js')

# 读取现有 questions.js（如果存在）
OLD = Path('/Volumes/driver/opdir/projects/shuati-xianfeng/questions.js')
old_data = None
if OLD.exists():
    content = OLD.read_text(encoding='utf-8')
    # 提取 window.QUESTION_BANKS = {...} 部分
    m = re.search(r'window\.QUESTION_BANKS\s*=\s*(\{.*?\});', content, re.DOTALL)
    if m:
        old_data = json.loads(m.group(1))

# 读取 PDF 提取的题目
pdf_questions = json.loads(SRC.read_text(encoding='utf-8'))
print(f"PDF 题目: {len(pdf_questions)} 道")

# 构建新题库
new_bank = {
    'name': '汽车驾照科目一题库202606',
    'single': [],
    'multi': [],
    'judge': [],
}
for q in pdf_questions:
    item = {
        'id': q['id'],
        'type': q['type'],
        'q': q['q'],
        'opts': q['opts'],
        'ans': q['ans'],
    }
    new_bank[q['type']].append(item)

print(f"  单选: {len(new_bank['single'])}")
print(f"  多选: {len(new_bank['multi'])}")
print(f"  判断: {len(new_bank['judge'])}")

# 合并到现有题库
if old_data:
    banks = old_data['banks']
    banks['driver-license-202606'] = new_bank
    # 更新 current 为第一个题库（保持原行为）
    first_code = list(banks.keys())[0]
    payload = {'banks': banks, 'current': first_code}
else:
    payload = {'banks': {'driver-license-202606': new_bank}, 'current': 'driver-license-202606'}

# 写入
js = 'window.QUESTION_BANKS = ' + json.dumps(payload, ensure_ascii=False) + ';\n'
OUT.write_text(js, encoding='utf-8')
print(f"\n✓ 写入 {OUT} ({OUT.stat().st_size/1024:.1f} KB)")
print(f"  题库数: {len(payload['banks'])}")
for code, bank in payload['banks'].items():
    print(f"  - {code} ({bank['name']}): 单选 {len(bank['single'])} / 多选 {len(bank['multi'])} / 判断 {len(bank['judge'])}")