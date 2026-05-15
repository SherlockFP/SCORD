@echo off
cd /d "%~dp0static"
uvicorn server:app --reload --host 0.0.0.0 --port 8000
pause
