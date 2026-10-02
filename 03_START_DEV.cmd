@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo.
echo KCM - 로컬 개발 서버 실행
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js를 찾을 수 없습니다. 기존 설치 상태를 Codex에서 먼저 확인해 주세요.
  pause
  exit /b 1
)
node scripts\check-env.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo npm.cmd를 찾을 수 없습니다. Node.js 설치 상태를 확인해 주세요.
  pause
  exit /b 1
)
if not exist node_modules\vite\package.json (
  echo 처음 실행에 필요한 npm 패키지를 설치합니다. 인터넷 연결이 필요합니다.
  call npm.cmd install
  if errorlevel 1 (
    echo 설치에 실패했습니다. 위 오류를 확인해 주세요.
    pause
    exit /b 1
  )
)
echo.
echo 이 창을 유지하면 개발 서버가 실행됩니다. 종료: Ctrl+C
call npm.cmd run dev -- --open
if errorlevel 1 (
  echo 실행에 실패했습니다. 포트 충돌이나 위 오류를 확인해 주세요.
  pause
  exit /b 1
)
endlocal
