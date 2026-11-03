@echo off
chcp 65001 > nul
cd /d %~dp0
if not exist dist\index.html (
  echo dist がありません。先に build.bat を実行してね
  pause
  exit /b 1
)
start "" http://localhost:8790/
node tools\serve.mjs 8790 dist
