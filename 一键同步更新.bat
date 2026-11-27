@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在从 Obsidian 原文件同步学术书目...
node scripts\sync-markdown.mjs
echo.
if exist ".git" (
  echo 检测到 Git 仓库，正在检查变更...
  git add data/catalog.json
  git diff --cached --quiet
  if errorlevel 1 (
    for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set TODAY=%%a-%%b-%%c
    git commit -m "chore: 同步最新学术资源与谱系"
    git push
    echo 已自动推送至远端，线上网页将在约 15 秒内更新！
  ) else (
    echo 书目内容无新增变更，无需推送。
  )
) else (
  echo 本地数据已更新！刷新 http://127.0.0.1:4173 即可查看最新结果。
)
echo.
pause
