@echo off
chcp 65001 >nul
title 象贤人生 · 内网穿透（SSH 免下载）
cd /d "%~dp0"

set "PORT=3000"
set "SSH=%WINDIR%\System32\OpenSSH\ssh.exe"

echo ==============================================
echo   象贤人生 · 内网穿透（SSH 反向隧道）
echo   本地端口 %PORT%  ->  公网 HTTPS 链接
echo ==============================================
echo.

if not exist "%SSH%" (
  echo [错误] 没找到 Windows 自带的 ssh.exe
  echo        期望路径：%SSH%
  echo        可在「设置 - 系统 - 可选功能」里安装「OpenSSH 客户端」。
  echo.
  pause
  exit /b 1
)

set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.workbuddy-ai\binaries\node\versions\22.22.2-2\node.exe" set "NODE_EXE=%USERPROFILE%\.workbuddy-ai\binaries\node\versions\22.22.2-2\node.exe"

netstat -an | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if %errorlevel%==0 (
  echo [1/2] 端口 %PORT% 已在监听，复用现有服务器。
) else (
  if not defined NODE_EXE (
    echo [错误] 没找到 node.exe，请先安装 Node.js：https://nodejs.org/
    pause
    exit /b 1
  )
  echo [1/2] 启动本地服务器 http://localhost:%PORT%
  start "xiangxian-server" cmd /k "%NODE_EXE%" server.js
  timeout /t 3 /nobreak >nul
)

echo.
echo [2/2] 建立 SSH 反向隧道（localhost.run）...
echo.
echo   ------------------------------------------------
echo   输出里会出现一条 https://xxxx.lhr.life 的公网链接
echo   把它发给别人即可。链接每次重启都会变。
echo   这个窗口必须一直开着，关掉 = 链接失效。
echo   ------------------------------------------------
echo.

"%SSH%" -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:%PORT% nokey@localhost.run

echo.
echo 隧道已退出。若 localhost.run 不通，可以试试 serveo：
echo   "%SSH%" -o StrictHostKeyChecking=no -R 80:localhost:%PORT% serveo.net
echo.
pause
