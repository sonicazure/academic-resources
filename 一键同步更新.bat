@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [1/3] 正在检查并自动修缮 Markdown 格式、补全空缺信息...
node scripts/enrich-markdown.mjs
if %errorlevel% neq 0 (
  echo.
  echo 自动修缮阶段出现异常，请检查上方信息。
  pause
  exit /b 1
)
echo.
echo [2/3] 正在从 Obsidian 同步学术资源与谱系及豆瓣札记...
node scripts/sync-markdown.mjs
if %errorlevel% neq 0 (
  echo.
  echo 同步失败，请检查上方错误信息。
  pause
  exit /b 1
)
echo.
echo [3/3] 正在推送更新到 GitHub Pages...
git add data/catalog.json data/reviews.json
git diff --cached --quiet
if %errorlevel% equ 0 (
  echo 没有检测到数据变更，无需推送。
) else (
  git commit -m "chore: sync catalog from Obsidian"
  git push
  echo.
  echo 已推送到 GitHub，约 30-60 秒后线上网页自动生效！
)
echo.
pause
