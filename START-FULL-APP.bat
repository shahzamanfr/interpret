@echo off
echo ========================================
echo   AI Communication Coach - Full Startup
echo ========================================
echo.

echo [1/3] Checking backend dependencies...
cd backend
if not exist "node_modules\" (
    echo Installing backend dependencies...
    call npm install
) else (
    echo Backend dependencies OK
)
echo.

echo [2/3] Starting Backend Server...
start "Backend Server" cmd /k "node server.js"
timeout /t 3 /nobreak >nul
echo.

echo [3/3] Starting Frontend...
cd ..
start "Frontend Dev Server" cmd /k "npm run dev"
echo.

echo ========================================
echo   Both servers are starting!
echo   Backend: http://localhost:8787
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo Press any key to open browser...
pause >nul
start http://localhost:5173
