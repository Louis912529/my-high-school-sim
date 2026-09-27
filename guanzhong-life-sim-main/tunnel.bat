@echo off
chcp 65001 >nul
title 象贤人生 · 内网穿透（cloudflared）
cd /d "%~dp0"

set "PORT=3000"
set "CF=%USERPROFILE%\cloudflared\cloudflared.exe"

echo ==============================================
echo   象贤人生 · 内网穿透
echo   本地端口 %PORT%  ->  公网 HTTPS 链接
echo ==============================================
echo.

if not exist "%CF%" (
  echo [错误] 没找到 cloudflared.exe
  echo        期望路径：%CF%
  echo        请把它放到该位置，或改用 tunnel-ssh.bat（免下载）。
  echo.
  pause
  exit /b 1
)

rem ---- 找一个可用的 node ----
set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.workbuddy-ai\binaries\node\versions\22.22.2-2\node.exe" set "NODE_EXE=%USERPROFILE%\.workbuddy-ai\binaries\node\versions\22.22.2-2\node.exe"
if not defined NODE_EXE (
  echo [错误] 没找到 node.exe，请先安装 Node.js：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

rem ---- 端口已被占用就直接复用，避免 EADDRINUSE ----
netstat -an | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if %errorlevel%==0 (
  echo [1/2] 端口 %PORT% 已在监听，复用现有服务器。
) else (
  echo [1/2] 启动本地服务器 http://localhost:%PORT%
  start "xiangxian-server" cmd /k "%NODE_EXE%" server.js
  timeout /t 3 /nobreak >nul
)

echo.
echo [2/2] 建立公网隧道...
echo.
echo   ------------------------------------------------
echo   下面这行 https://xxxx.trycloudflare.com 就是公网链接
echo   把它发给别人即可。链接每次重启都会变。
echo   这个窗口必须一直开着，关掉 = 链接失效。
echo   ------------------------------------------------
echo.

"%CF%" tunnel --url http://localhost:%PORT%

echo.
echo 隧道已退出（链接已失效）。
pause
