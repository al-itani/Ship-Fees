@echo off
setlocal

echo [1/5] Stopping Ship Fees...
taskkill /F /IM "Ship Fees.exe" >nul 2>&1
if %errorlevel% neq 0 (
    echo       App was not running, continuing.
) else (
    echo       App stopped.
)

echo [2/5] Building...
call npm run build:asar
if %errorlevel% neq 0 (
    echo BUILD FAILED. Aborting.
    pause
    exit /b 1
)

echo [3/5] Deploying app.asar...
copy /Y "dist-app\win-unpacked\resources\app.asar" "C:\Program Files\Ship Fees\resources\app.asar"
if %errorlevel% neq 0 (
    echo COPY FAILED. Run this script as Administrator if access was denied.
    pause
    exit /b 1
)

echo [4/5] Deploy successful.

echo [5/5] Relaunching Ship Fees...
start "" "C:\Program Files\Ship Fees\Ship Fees.exe"

exit /b 0
