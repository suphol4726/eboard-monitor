@echo off
chcp 65001 >nul
title E-Board Monitoring System - 1-Click Updater
echo ========================================================
echo   E-Board Monitoring System - 1-Click Safe Updater
echo   (อัปเดตโค้ดใหม่โดยไม่ลบข้อมูล devices.json / settings.json)
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. Backup data files before any update
if not exist ".backup_data" mkdir ".backup_data"
if exist "devices.json" copy /Y "devices.json" ".backup_data\devices.json.bak" >nul
if exist "settings.json" copy /Y "settings.json" ".backup_data\settings.json.bak" >nul
if exist "logs.json" copy /Y "logs.json" ".backup_data\logs.json.bak" >nul
echo [1/4] สำรองข้อมูลอุปกรณ์และการตั้งค่าเดิมเรียบร้อยแล้ว

:: 2. If Git repository is configured, pull latest code automatically
if exist ".git" (
    echo [2/4] ตรวจพบ Git Repository กำลังดึงโค้ดล่าสุดจาก GitHub...
    git fetch --all
    git reset --hard origin/main
) else (
    echo [2/4] ใช้ไฟล์โค้ดชุดปัจจุบันในโฟลเดอร์...
)

:: 3. Restore preserved data files so they are never overwritten
if exist ".backup_data\devices.json.bak" copy /Y ".backup_data\devices.json.bak" "devices.json" >nul
if exist ".backup_data\settings.json.bak" copy /Y ".backup_data\settings.json.bak" "settings.json" >nul
if exist ".backup_data\logs.json.bak" copy /Y ".backup_data\logs.json.bak" "logs.json" >nul

:: 4. Build and restart PM2 service
echo [3/4] กำลัง Build ระบบเวอร์ชันใหม่ (npm run build)...
call npm install --no-audit --no-fund
call npm run build

:: Ensure data files remain intact
if exist ".backup_data\devices.json.bak" copy /Y ".backup_data\devices.json.bak" "devices.json" >nul
if exist ".backup_data\settings.json.bak" copy /Y ".backup_data\settings.json.bak" "settings.json" >nul
if exist ".backup_data\logs.json.bak" copy /Y ".backup_data\logs.json.bak" "logs.json" >nul

echo [4/4] กำลังรีสตาร์ตบริการ PM2 (eboard-monitor)...
call pm2 restart eboard-monitor
call pm2 save

echo.
echo ========================================================
echo   อัปเดตระบบเสร็จสมบูรณ์! สามารถเปิดใช้งาน https://eboard.spsm-it.cc/ ได้ทันที
echo ========================================================
pause
