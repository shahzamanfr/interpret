@echo off
echo ========================================
echo   AI Communication Coach - FIXED
echo ========================================
echo.
echo Starting backend server...
echo.

cd backend
start "Backend Server" cmd /k "npm start"

timeout /t 3 /nobreak >nul

cd ..
echo.
echo Starting frontend...
echo.
start "Frontend" cmd /k "npm run dev"

echo.
echo ========================================
echo   Both servers starting...
echo ========================================
echo.
echo Backend: http://localhost:8787
echo Frontend: http://localhost:5173
echo.
echo Press any key to exit this window...
pause >nul
