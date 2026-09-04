@echo off
cd /d "%~dp0"
if not exist node_modules ( echo Premiere installation, patientez... & call npm install )
call npm run start
