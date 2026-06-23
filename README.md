# 刷题先锋 1.0

暗黑科技风刷题工具 · 单文件 HTML + 静态部署 · 无构建步骤

## 功能

- 📝 **单选 / 多选分开练习**：顶部 Tab 切换模式
- 🔀 **每次随机洗牌**：打开页面 = 新一轮乱序题
- ✅❌ **即时判分**：提交后立即高亮对错，错题显示正确答案
- 📊 **结果卡**：本轮答对 / 答错 / 正确率 一目了然

## 技术栈

- 单文件 `index.html`（HTML + CSS + JS 全 inline）
- `questions.js` 嵌入题目数据（单选 350 + 多选 350 = 700 题）
- `convert.py` 一次性脚本，把 Excel 题库转成 JS 数据
- 字体：Noto Sans SC + JetBrains Mono（Google Fonts）
- 主题：Modern Dark + 轻 Cyberpunk（紫蓝主调 + 霓虹青）

## 部署

```bash
# Cloudflare Pages 直接静态托管
# 项目根 → index.html / questions.js
```

## 本地运行

```bash
python3 -m http.server 8000
# 访问 http://localhost:8000
```

---

钱小虾 · build by OpenClaw