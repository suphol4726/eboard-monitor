@echo off
TITLE E-Board Monitor Production Installer & Launcher
COLOR 0A
echo =========================================================
echo    E-Board Monitor - Windows Production Setup
echo =========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js v20+ from https://nodejs.org/
    pause
    exit /b
)

echo [1/3] Installing NPM dependencies...
call npm install

echo [2/3] Cleaning old bundle and Building Production Bundle...
if exist "dist\server.cjs" del /f /q "dist\server.cjs"
call npm run build

if not exist "dist\server.cjs" (
    echo.
    echo [ERROR] Production build failed! dist\server.cjs was not created.
    pause
    exit /b 1
)

echo [3/3] Stopping any old process on Port 3000 and Starting Server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>nul
)

echo.
echo =========================================================
echo  E-Board Monitor is running at http://localhost:3000
echo  Press Ctrl+C to stop the server
echo =========================================================
echo.

set NODE_ENV=production
node dist/server.cjs
pause
