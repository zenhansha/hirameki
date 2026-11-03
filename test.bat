@echo off
chcp 65001 > nul
cd /d %~dp0
if not exist node_modules call npm install
call npx vitest run
call npm run build
call npx playwright test
pause
