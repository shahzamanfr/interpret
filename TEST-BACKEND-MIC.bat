@echo off
echo ========================================
echo   Testing Backend Server
echo ========================================
echo.

cd backend

echo [1/2] Installing dependencies if needed...
if not exist "node_modules\" (
    echo Installing...
    call npm install
)
echo.

echo [2/2] Starting backend server...
echo Backend will run on http://localhost:8787
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

node server.js
