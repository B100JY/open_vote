# Open Vote - Supabase 자동 설정 스크립트
# 사용법: .\setup-supabase.ps1 실행

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Open Vote - Supabase 자동 설정" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$PROJECT_REF = "zxrwlwhbcivwpvmktuoj"
$SETUP_SQL_PATH = "supabase\setup.sql"

# 1. SQL 파일 확인
Write-Host "[1/3] 설정 SQL 파일 확인 중..." -ForegroundColor Yellow

if (Test-Path $SETUP_SQL_PATH) {
    Write-Host "  ✓ SQL 파일 발견: $SETUP_SQL_PATH" -ForegroundColor Green
} else {
    Write-Host "  ✗ SQL 파일을 찾을 수 없습니다!" -ForegroundColor Red
    Write-Host "  supabase\setup.sql 파일이 있는지 확인해주세요." -ForegroundColor Red
    exit 1
}

# 2. Supabase CLI 확인
Write-Host ""
Write-Host "[2/3] Supabase CLI 확인 중..." -ForegroundColor Yellow

$supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue

if ($null -eq $supabaseCmd) {
    Write-Host "  ⚠ Supabase CLI 가 설치되어 있지 않습니다." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  수동으로 설정하려면:" -ForegroundColor Cyan
    Write-Host "  1. https://app.supabase.com/project/$PROJECT_REF/sql/new 로 이동" -ForegroundColor Cyan
    Write-Host "  2. $SETUP_SQL_PATH 파일 내용을 복사하여 붙여넣기" -ForegroundColor Cyan
    Write-Host "  3. RUN 버튼 클릭" -ForegroundColor Cyan
    Write-Host ""
    
    $openBrowser = Read-Host "Supabase SQL Editor 를 브라우저에서 열까요? (y/n)"
    
    if ($openBrowser -eq 'y' -or $openBrowser -eq 'Y') {
        Start-Process "https://app.supabase.com/project/$PROJECT_REF/sql/new"
        Write-Host "  → 브라우저가 열렸습니다. SQL 파일을 복사하여 실행하세요." -ForegroundColor Green
    }
    
    exit 0
}

Write-Host "  ✓ Supabase CLI 발견" -ForegroundColor Green

# 3. Supabase 로그인 확인
Write-Host ""
Write-Host "[3/3] Supabase 로그인 확인 중..." -ForegroundColor Yellow

try {
    $linkInfo = supabase link --project-ref $PROJECT_REF 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ 프로젝트 연결됨: $PROJECT_REF" -ForegroundColor Green
        
        # Edge Functions 배포
        Write-Host ""
        Write-Host "======================================" -ForegroundColor Cyan
        Write-Host "  Edge Functions 배포 시작" -ForegroundColor Cyan
        Write-Host "======================================" -ForegroundColor Cyan
        
        Write-Host ""
        Write-Host "  → cast_vote 함수 배포 중..." -ForegroundColor Yellow
        supabase functions deploy cast_vote --project-ref $PROJECT_REF
        
        Write-Host ""
        Write-Host "  → generate_voter_codes 함수 배포 중..." -ForegroundColor Yellow
        supabase functions deploy generate_voter_codes --project-ref $PROJECT_REF
        
        Write-Host ""
        Write-Host "  ✓ 모든 함수가 배포되었습니다!" -ForegroundColor Green
    } else {
        throw "Link failed"
    }
} catch {
    Write-Host "  ⚠ 프로젝트가 연결되어 있지 않습니다." -ForegroundColor Yellow
    Write-Host ""
    
    $linkProject = Read-Host "이 프로젝트를 링크할까요? (y/n)"
    
    if ($linkProject -eq 'y' -or $linkProject -eq 'Y') {
        Write-Host "  → Supabase 로그인 페이지를 엽니다..." -ForegroundColor Yellow
        supabase login
        
        Write-Host "  → 프로젝트를 링크합니다..." -ForegroundColor Yellow
        supabase link --project-ref $PROJECT_REF
        
        Write-Host "  ✓ 프로젝트가 링크되었습니다!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  수동 설정 방법:" -ForegroundColor Cyan
        Write-Host "  1. 터미널에서 'supabase login' 실행" -ForegroundColor Cyan
        Write-Host "  2. 'supabase link --project-ref $PROJECT_REF' 실행" -ForegroundColor Cyan
        exit 0
    }
}

# 완료 메시지
Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  설정이 완료되었습니다! 🎉" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Cyan
Write-Host "  1. SQL Editor 에서 supabase\setup.sql 실행" -ForegroundColor White
Write-Host "     → https://app.supabase.com/project/$PROJECT_REF/sql/new" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Edge Functions 환경 변수 설정:" -ForegroundColor White
Write-Host "     supabase secrets set SUPABASE_URL=https://$PROJECT_REF.supabase.co" -ForegroundColor Gray
Write-Host "     supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. 앱 실행: .\run-app.ps1" -ForegroundColor White
Write-Host ""
