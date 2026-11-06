@echo off
set GIT_EXEC=C:\Users\lenovo\.gemini\antigravity\scratch\mingit\cmd\git.exe
echo ===================================================================
echo Finwurl Enterprises Private Limited - GitHub Automated Uploader
echo Repository: https://github.com/apurbapal32-design/Apurba-Pal
echo ===================================================================
echo.
echo Checking Git status...
"%GIT_EXEC%" status -s
echo.
set /p GITHUB_TOKEN="Enter your GitHub Personal Access Token (starts with ghp_): "
if "%GITHUB_TOKEN%"=="" (
    echo.
    echo [Info] Attempting standard push using cached GitHub credentials...
    "%GIT_EXEC%" push -u origin main
) else (
    echo.
    echo [Info] Pushing with provided token to apurbapal32-design/Apurba-Pal...
    "%GIT_EXEC%" push https://apurbapal32-design:%GITHUB_TOKEN%@github.com/apurbapal32-design/Apurba-Pal.git main --force
)
echo.
echo ===================================================================
echo Process Complete. Check https://github.com/apurbapal32-design/Apurba-Pal
echo ===================================================================
pause
