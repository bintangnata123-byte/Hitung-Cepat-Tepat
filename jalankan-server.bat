@echo off
cd /d "%~dp0"
title Micro-Quiz Math Reflex Server
echo Menjalankan Server Micro-Quiz Math Reflex...
start "" "http://localhost:3000"
node server.js
pause
