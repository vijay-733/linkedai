@echo off
title LinkedAI Launcher
color 0A
setlocal

set "DIR=%~dp0"
set "CF=%DIR%cloudflared.exe"

echo.
echo  ============================================
echo    LinkedAI  -  Full Stack Launcher
echo  ============================================
echo.

:: ── Step 1: Free port 3001 ────────────────────────────────────────────────────
echo [1/5] Freeing port 3001...
call npx kill-port 3001 >nul 2>&1
timeout /t 1 /nobreak >nul

:: ── Step 2: Download cloudflared if missing ───────────────────────────────────
echo [2/5] Checking cloudflared...
if not exist "%CF%" (
    echo      Not found - downloading cloudflared.exe...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%CF%'" 2>nul
    if not exist "%CF%" (
        echo      Download failed - falling back to localtunnel
        set USE_LT=1
    ) else (
        echo      Downloaded OK
    )
) else (
    echo      Found cloudflared.exe
)

:: ── Step 3: Start backend in a new window ─────────────────────────────────────
echo [3/5] Starting backend...
start "LinkedAI Backend" cmd /k "cd /d %DIR%backend && npm run dev"

:: ── Step 4: Wait until backend is healthy ─────────────────────────────────────
echo [4/5] Waiting for backend...
:WAIT
timeout /t 2 /nobreak >nul
curl -s http://127.0.0.1:3001/health >nul 2>&1
if errorlevel 1 goto WAIT
echo      Backend ready!

:: ── Step 5: Open tunnel ───────────────────────────────────────────────────────
echo [5/5] Opening public tunnel...
echo.
echo  ============================================
echo    Copy the URL below and share it.
echo    The full app loads at that URL directly.
echo  ============================================
echo.

if defined USE_LT (
    npx localtunnel --port 3001
) else (
    "%CF%" tunnel --url http://127.0.0.1:3001
)

endlocal
pause
