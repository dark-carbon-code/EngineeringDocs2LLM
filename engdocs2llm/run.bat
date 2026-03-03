@echo off
echo ============================================================
echo   EngineeringDocs2LLM Converter
echo ============================================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install from https://python.org
    pause
    exit /b 1
)

:: Install dependencies
echo Installing dependencies...
pip install -r requirements.txt --quiet
echo.

:: Start server
echo Starting server...
echo Open your browser to: http://localhost:5000
echo Press Ctrl+C to stop.
echo.
python server.py
pause
