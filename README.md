# 学术资源与谱系 · Editorial Folio

基于个人 Markdown 档案 [学术资源与谱系.md](file:///d:/Obsidian_Data/猫德黑/!%20学术谱系/学术资源与谱系.md) 自动生成的静态典藏网页。

## 日常维护

1. **同步 Obsidian 最新书目**（从原 Markdown 重新解析生成 `data/catalog.json`）：
   ```bash
   npm run sync
   ```
   也可指定自定义路径：`node scripts/sync-markdown.mjs "D:\path\to\file.md"`

2. **本地预览**：
   ```bash
   npm run dev
   ```
   打开 `http://127.0.0.1:4173` 即可浏览。

## 部署上线

本项目为纯静态站点（零构建步骤），将整个目录推送至 **GitHub Pages**、**Cloudflare Pages** 或 **Vercel** 即可直接上线。
