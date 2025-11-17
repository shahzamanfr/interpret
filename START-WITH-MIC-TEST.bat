@echo off
echo ========================================
echo   AI Communication Coach - Mic Test
echo ========================================
echo.

echo [1/3] Checking environment...
if not exist ".env" (
    echo ERROR: .env file not found!
    echo Please copy .env.example to .env and add your API keys
    pause
    exit /b 1
)

if not exist "backend\.env" (
    echo ERROR: backend\.env file not found!
    echo Please copy backend\.env.example to backend\.env
    pause
    exit /b 1
)

echo [2/3] Starting backend server...
start "Backend Server" cmd /k "cd backend && npm start"
timeout /t 3 /nobreak > nul

echo [3/3] Starting frontend...
start "Frontend Dev Server" cmd /k "npm run dev"
timeout /t 3 /nobreak > nul

echo.
echo ========================================
echo   Servers Started!
echo ========================================
echo.
echo Backend:  http://localhost:8787
echo Frontend: http://localhost:5173
echo.
echo Test microphone:
echo 1. Open http://localhost:5173
echo 2. Click microphone button
echo 3. Speak clearly
echo.
echo Or test directly:
echo - Open TEST-MIC-FIXED.html in browser
echo.
echo Press any key to open test page...
pause > nul

start TEST-MIC-FIXED.html

echo.
echo Servers are running in separate windows.
echo Close those windows to stop the servers.
echo.
pause
