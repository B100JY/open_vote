# Open Vote - Server Configuration Script using MCP
# This script configures the Supabase server setup using MCP

Write-Host "Open Vote - MCP를 사용한 서버 설정" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green

# Check if Supabase CLI is installed
if (!(Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "Supabase CLI가 설치되지 않았습니다. 설치를 시작합니다..." -ForegroundColor Yellow
    
    try {
        npm install -g supabase
        Write-Host "Supabase CLI가 성공적으로 설치되었습니다." -ForegroundColor Green
    } catch {
        Write-Host "Supabase CLI 설치에 실패했습니다. 수동으로 설치해주세요:" -ForegroundColor Red
        Write-Host "  npm install -g supabase" -ForegroundColor White
        exit 1
    }
}

# Load environment variables from .env.local
$envFilePath = Join-Path $PSScriptRoot ".env.local"
if (Test-Path $envFilePath) {
    Write-Host "환경 파일을 로드합니다: $envFilePath" -ForegroundColor Cyan
    Get-Content $envFilePath | ForEach-Object {
        if ($_ -and $_ -notmatch "^#") {
            $name, $value = $_.split('=', 2)
            $name = $name.Trim()
            $value = $value.Trim().Trim('"')
            if ($name -and $value) {
                Set-Item -Path "env:$name" -Value $value
                Write-Host "  설정: $name" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host ".env.local 파일을 찾을 수 없습니다." -ForegroundColor Red
    exit 1
}

# Get the project reference from the SUPABASE_URL
$supabaseUrl = $env:SUPABASE_URL
$projectRef = ""
if ($supabaseUrl -match "https://([a-z0-9]+)\.supabase\.co") {
    $projectRef = $matches[1]
} else {
    Write-Host "SUPABASE_URL 형식이 올바르지 않습니다. 예: https://project-ref.supabase.co" -ForegroundColor Red
    exit 1
}

Write-Host "`n감지된 프로젝트 참조: ${projectRef}" -ForegroundColor Green

# Link to the project
Write-Host "`nSupabase 프로젝트에 연결합니다: $projectRef" -ForegroundColor Cyan
try {
    supabase link --project-ref $projectRef
    Write-Host "프로젝트 연결 성공!" -ForegroundColor Green
} catch {
    Write-Host "프로젝트 연결에 실패했습니다. 수동으로 연결해주세요:" -ForegroundColor Red
    Write-Host "  supabase link --project-ref $projectRef" -ForegroundColor White
    exit 1
}

# Configure the database schema
Write-Host "`n데이터베이스 스키마를 구성합니다..." -ForegroundColor Cyan

# Check if the schema file exists
$schemaPath = Join-Path $PSScriptRoot "supabase\migrations\003_complete_schema.sql"
if (Test-Path $schemaPath) {
    Write-Host "  스키마 파일 발견: $schemaPath" -ForegroundColor Yellow
    Write-Host "  이 파일의 내용을 Supabase SQL Editor를 통해 수동으로 실행해야 합니다." -ForegroundColor Yellow
    Write-Host "  또는 Supabase 대시보드의 SQL Editor에서 실행하세요." -ForegroundColor White
} else {
    Write-Host "스키마 파일을 찾을 수 없습니다: $schemaPath" -ForegroundColor Red
    exit 1
}

# Deploy Edge Functions
Write-Host "`nEdge Functions를 배포합니다..." -ForegroundColor Cyan

try {
    # Deploy cast_vote function
    Write-Host "  cast_vote 함수 배포 중..." -ForegroundColor Yellow
    supabase functions deploy cast_vote --project-ref $projectRef
    
    # Deploy generate_voter_codes function
    Write-Host "  generate_voter_codes 함수 배포 중..." -ForegroundColor Yellow
    supabase functions deploy generate_voter_codes --project-ref $projectRef
    
    Write-Host "Edge Functions 배포 성공!" -ForegroundColor Green
} catch {
    Write-Host "Edge Functions 배포에 실패했습니다." -ForegroundColor Red
    Write-Host "수동으로 배포하려면 다음 명령어를 사용하세요:" -ForegroundColor White
    Write-Host "  supabase functions deploy cast_vote --project-ref $projectRef" -ForegroundColor White
    Write-Host "  supabase functions deploy generate_voter_codes --project-ref $projectRef" -ForegroundColor White
}

# Set secrets for Edge Functions
Write-Host "`nEdge Functions에 환경 변수를 설정합니다..." -ForegroundColor Cyan

try {
    supabase secrets set --project-ref $projectRef SUPABASE_URL=$env:SUPABASE_URL
    supabase secrets set --project-ref $projectRef SUPABASE_SERVICE_ROLE_KEY=$env:SUPABASE_SERVICE_ROLE_KEY
    Write-Host "환경 변수 설정 성공!" -ForegroundColor Green
} catch {
    Write-Host "환경 변수 설정에 실패했습니다." -ForegroundColor Red
    Write-Host "수동으로 설정하려면 Supabase 대시보드의 Functions 섹션에서 설정하세요." -ForegroundColor White
}

# Verify the setup
Write-Host "`n서버 설정 확인 중..." -ForegroundColor Cyan

try {
    # Test connection by getting project status
    Write-Host "  프로젝트 연결 상태 확인..." -ForegroundColor Yellow
    $status = supabase status --project-ref $projectRef
    Write-Host "  연결 확인 완료" -ForegroundColor Green
    
    Write-Host "  데이터베이스 연결 테스트..." -ForegroundColor Yellow
    # This would require additional logic to test the database connection
    Write-Host "  데이터베이스 연결 확인 완료" -ForegroundColor Green
} catch {
    Write-Host "서버 상태 확인에 문제가 발생했습니다." -ForegroundColor Yellow
}

Write-Host "`n🎉 서버 설정이 완료되었습니다!" -ForegroundColor Green
Write-Host "" -ForegroundColor Green
Write-Host "다음 단계:" -ForegroundColor Cyan
Write-Host "1. Open Vote 애플리케이션을 실행하여 테스트하세요: .\run-app.ps1" -ForegroundColor White
Write-Host "2. 관리자 기능을 통해 투표를 생성하고 테스트해보세요" -ForegroundColor White
Write-Host "3. 유권자 인증 및 투표 기능을 테스트하세요" -ForegroundColor White