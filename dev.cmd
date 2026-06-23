@echo off
echo === Killing stale dev processes ===

for %%p in (5173 5174 5175 5176 5177 5178 8787) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%%p " 2^>nul') do (
        echo Killing PID %%a on port %%p
        taskkill /pid %%a /f >nul 2>&1
    )
)

echo.
echo === Starting dev ===
call npm run dev
