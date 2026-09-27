@echo off
chcp 65001 >nul
title 象贤人生 · 高中三年模拟器
cd /d "%~dp0"
echo ==============================================
echo   象贤人生 · 高中三年模拟器
echo   正在启动本地服务器...
echo ==============================================
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [错误] 没有找到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)
start "" http://localhost:3000
node server.js
pause
