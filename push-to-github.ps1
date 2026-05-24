# GitHub에 my-card-game 저장소로 업로드하는 스크립트
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== 1. Git 저장소 준비 ===" -ForegroundColor Cyan

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git이 설치되어 있지 않습니다. https://git-scm.com 에서 설치하세요." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path .git)) {
    git init
    git branch -M main
}

git add .gitignore package.json package-lock.json server.js install-and-start.bat index.html public/
git status

$status = git status --porcelain
if ($status) {
    git commit -m "Initial commit: number card PVP game with matchmaking"
} else {
    Write-Host "커밋할 변경 사항이 없습니다." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== 2. GitHub CLI 확인 ===" -ForegroundColor Cyan

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "GitHub CLI(gh)가 없습니다. https://cli.github.com 에서 설치 후 gh auth login 하세요." -ForegroundColor Red
    Write-Host ""
    Write-Host "수동으로 할 경우:" -ForegroundColor Yellow
    Write-Host "  1. https://github.com/new 에서 저장소 이름: my-card-game 생성"
    Write-Host "  2. git remote add origin https://github.com/본인아이디/my-card-game.git"
    Write-Host "  3. git push -u origin main"
    exit 1
}

gh auth status
if ($LASTEXITCODE -ne 0) {
    Write-Host "먼저 실행: gh auth login" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== 3. GitHub 저장소 생성 및 push ===" -ForegroundColor Cyan

$remote = git remote get-url origin 2>$null
if (-not $remote) {
    gh repo create my-card-game --public --source=. --remote=origin --push
} else {
    Write-Host "이미 origin이 있습니다: $remote"
    git push -u origin main
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "완료! 저장소:" -ForegroundColor Green
    gh repo view --web 2>$null
    gh repo view --json url -q .url
} else {
    Write-Host "push 실패. 위 메시지를 확인하세요." -ForegroundColor Red
}
