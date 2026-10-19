@echo off
cd /d "%~dp0"
title Micro-Quiz Math Reflex — Portal Guru
echo Membuka Portal Rekap Guru...
start "" "http://localhost:3000/guru"
node server.js
pause
