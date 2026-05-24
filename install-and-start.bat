@echo off
cd /d "%~dp0"
echo.
echo [1/2] 필요한 패키지 설치 중...
call npm.cmd install
if errorlevel 1 (
  echo.
  echo 설치 실패. 인터넷 연결을 확인한 뒤 다시 실행하세요.
  pause
  exit /b 1
)

echo.
echo [2/2] 게임 서버 시작...
echo 브라우저에서 http://localhost:3000 을 여세요.
echo 종료하려면 Ctrl+C
echo.
call npm.cmd start
pause
