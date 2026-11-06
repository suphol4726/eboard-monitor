@echo off
chcp 65001 >nul
title E-Board Monitoring System - 1-Click Safe Updater (GitHub + Port 3000 Auto-Fix)
echo ======================================================================
echo   E-Board Monitoring System - 1-Click Safe Updater
echo   (ปลดล็อก Port 3000 + ซิงก์ GitHub + อัปเดตโดยไม่ลบข้อมูลอุปกรณ์เดิม)
echo ======================================================================
echo.

cd /d "%~dp0"

:: Add standard Windows Git paths automatically if installed
if exist "C:\Program Files\Git\cmd\git.exe" set "PATH=%PATH%;C:\Program Files\Git\cmd"
if exist "C:\Program Files (x86)\Git\cmd\git.exe" set "PATH=%PATH%;C:\Program Files (x86)\Git\cmd"

:: 1. Backup data files before any update
if not exist ".backup_data" mkdir ".backup_data"
if exist "devices.json" copy /Y "devices.json" ".backup_data\devices.json.bak" >nul
if exist "settings.json" copy /Y "settings.json" ".backup_data\settings.json.bak" >nul
if exist "logs.json" copy /Y "logs.json" ".backup_data\logs.json.bak" >nul
echo [1/5] สำรองข้อมูล devices.json, settings.json, logs.json เรียบร้อยแล้ว

:: 2. Stop PM2 and kill any zombie Node.js process stuck on Port 3000
echo [2/5] กำลังเคลียร์โปรเซสเก่าที่ค้างบน Port 3000...
call pm2 stop eboard-monitor >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo       - ปิดโปรเซสที่ค้างบน Port 3000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

:: 3. Link GitHub Repository and pull latest code automatically
echo [3/5] กำลังเชื่อมต่อและดึงโค้ดล่าสุดจาก GitHub (suphol4726/eboard-monitor)...
where git >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    if not exist ".git" (
        git init
        git remote add origin https://github.com/suphol4726/eboard-monitor.git
    ) else (
        git remote set-url origin https://github.com/suphol4726/eboard-monitor.git >nul 2>&1 || git remote add origin https://github.com/suphol4726/eboard-monitor.git >nul 2>&1
    )
    git fetch --all
    git reset --hard origin/main
) else (
    echo       [แจ้งเตือน] ไม่พบคำสั่ง Git ในระบบ ใช้ไฟล์โค้ดชุดปัจจุบันในโฟลเดอร์แทน
)

:: 4. Restore preserved data files so they are never overwritten
if exist ".backup_data\devices.json.bak" copy /Y ".backup_data\devices.json.bak" "devices.json" >nul
if exist ".backup_data\settings.json.bak" copy /Y ".backup_data\settings.json.bak" "settings.json" >nul
if exist ".backup_data\logs.json.bak" copy /Y ".backup_data\logs.json.bak" "logs.json" >nul

:: 5. Remove old server bundle, build fresh bundle, and restart PM2
echo [4/5] กำลังลบไฟล์เซิร์ฟเวอร์ตัวเก่าและสั่ง Build ใหม่ (npm run build)...
if exist "dist\server.cjs" del /F /Q "dist\server.cjs"
call npm install --no-audit --no-fund
call npm run build

:: Ensure data files remain intact after build
if exist ".backup_data\devices.json.bak" copy /Y ".backup_data\devices.json.bak" "devices.json" >nul
if exist ".backup_data\settings.json.bak" copy /Y ".backup_data\settings.json.bak" "settings.json" >nul
if exist ".backup_data\logs.json.bak" copy /Y ".backup_data\logs.json.bak" "logs.json" >nul

echo [5/5] กำลังเริ่มการทำงาน PM2 (eboard-monitor พร้อมระบบคืนค่า RAM อัตโนมัติ 400MB)...
call pm2 delete eboard-monitor >nul 2>&1
call pm2 start dist/server.cjs --name eboard-monitor --max-memory-restart 400M
call pm2 save

echo.
echo ======================================================================
echo   อัปเดตและรีสตาร์ตเซิร์ฟเวอร์สำเร็จ 100%%!
echo   สามารถกดปุ่มอัปเดตผ่านหน้าเว็บ https://eboard.spsm-it.cc/ ในครั้งถัดไปได้ทันที
echo ======================================================================
pause
