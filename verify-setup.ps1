# Open Vote - Setup Verification Script
# This script verifies that the Supabase setup is working correctly

Write-Host "Open Vote - 설정 검증 스크립트" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green

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

# Validate environment variables
Write-Host "`n환경 변수 검증 중..." -ForegroundColor Cyan

$requiredVars = @{
    "SUPABASE_URL" = $env:SUPABASE_URL
    "SUPABASE_ANON_KEY" = $env:SUPABASE_ANON_KEY
    "SUPABASE_SERVICE_ROLE_KEY" = $env:SUPABASE_SERVICE_ROLE_KEY
}

$allValid = $true
foreach ($varName in $requiredVars.Keys) {
    $value = $requiredVars[$varName]
    if ([string]::IsNullOrEmpty($value)) {
        Write-Host "  ❌ ${varName}: 설정되지 않음" -ForegroundColor Red
        $allValid = $false
    } else {
        Write-Host "  ✅ ${varName}: 설정됨" -ForegroundColor Green
    }
}

if (-not $allValid) {
    Write-Host "`n필수 환경 변수가 누락되었습니다. .env.local 파일을 확인해주세요." -ForegroundColor Red
    exit 1
}

# Extract project reference from URL
$projectRef = ""
if ($env:SUPABASE_URL -match "https://([a-z0-9]+)\.supabase\.co") {
    $projectRef = $matches[1]
    Write-Host "`n프로젝트 참조 추출됨: $projectRef" -ForegroundColor Green
} else {
    Write-Host "`n프로젝트 참조를 추출할 수 없습니다. URL 형식을 확인해주세요." -ForegroundColor Red
    exit 1
}

# Check if Supabase CLI is available
$hasSupabaseCLI = Get-Command supabase -ErrorAction SilentlyContinue

if ($hasSupabaseCLI) {
    Write-Host "`nSupabase CLI 연결 테스트 중..." -ForegroundColor Cyan
    
    try {
        # Try to get project status
        $status = supabase status --project-ref $projectRef 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ CLI 연결: 성공" -ForegroundColor Green
        } else {
            Write-Host "  ❌ CLI 연결: 실패" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ❌ CLI 연결: 실패" -ForegroundColor Red
    }
}

# Test API connectivity
Write-Host "`nAPI 연결 테스트 중..." -ForegroundColor Cyan

try {
    # Test if Supabase is accessible
    $response = Invoke-RestMethod -Uri "$env:SUPABASE_URL/auth/v1/authorize" -Method GET -ErrorAction Stop
    Write-Host "  ❌ 예상치 못한 응답: 인증 URL에 GET 요청은 일반적으로 허용되지 않습니다" -ForegroundColor Yellow
} catch {
    # Getting an error is expected, but we want to check the type of error
    if ($_.Exception.Response.StatusCode.Value__ -eq 404 -or $_.Exception.Response.StatusCode.Value__ -eq 401 -or $_.Exception.Response.StatusCode.Value__ -eq 405) {
        Write-Host "  ✅ API 엔드포인트 접근: 성공 (예상된 응답 코드: $($_.Exception.Response.StatusCode.Value__))" -ForegroundColor Green
    } else {
        Write-Host "  ❌ API 엔드포인트 접근: 실패 ($($_.Exception.Response.StatusCode.Value__))" -ForegroundColor Red
    }
}

# Check if Edge Functions are deployed
Write-Host "`nEdge Functions 존재 여부 확인 중..." -ForegroundColor Cyan

$functions = @("cast_vote", "generate_voter_codes")
foreach ($func in $functions) {
    try {
        $functionUrl = "${env:SUPABASE_URL}/functions/v1/${func}"
        $headers = @{
            "Authorization" = "Bearer ${env:SUPABASE_ANON_KEY}"
            "Content-Type" = "application/json"
        }
        
        # Try to access the function (it will likely fail with bad request, which is okay)
        $response = Invoke-RestMethod -Uri $functionUrl -Method POST -Headers $headers -Body "{}" -ErrorAction SilentlyContinue
        Write-Host "  ? ${func}: 접근 가능" -ForegroundColor Yellow
    } catch {
        if ($_.Exception.Response.StatusCode.Value__ -eq 400 -or $_.Exception.Response.StatusCode.Value__ -eq 401) {
            Write-Host "  ✅ ${func}: 배포됨 (접근 가능, 요청 형식 오류는 정상)" -ForegroundColor Green
        } elseif ($_.Exception.Response.StatusCode.Value__ -eq 404) {
            Write-Host "  ❌ ${func}: 배포되지 않음" -ForegroundColor Red
        } else {
            Write-Host "  ? ${func}: 상태 확인 불가 ($($_.Exception.Response.StatusCode.Value__))" -ForegroundColor Yellow
        }
    }
}

# Check database schema elements
Write-Host "`n데이터베이스 스키마 검증 중..." -ForegroundColor Cyan

# This would require a database connection library, which is complex in PowerShell
# For now, we'll just mention what to check manually
Write-Host "  수동 확인 필요:" -ForegroundColor Yellow
Write-Host "  - Supabase 대시보드의 SQL Editor에서 다음 테이블이 존재하는지 확인:" -ForegroundColor White
Write-Host "    • elections" -ForegroundColor White
Write-Host "    • voter_codes" -ForegroundColor White
Write-Host "    • ballots" -ForegroundColor White
Write-Host "    • rate_limits" -ForegroundColor White
Write-Host "    • audit_logs" -ForegroundColor White

Write-Host "`n다음 명령어로 데이터베이스 함수 존재 여부를 확인할 수 있습니다:" -ForegroundColor Cyan
Write-Host "supabase db shell --project-ref ${projectRef}" -ForegroundColor White
Write-Host "그리고 다음 SQL 쿼리를 실행:" -ForegroundColor White
Write-Host "  \df+" -ForegroundColor White
Write-Host "  검색어: cast_anonymous_vote, generate_voter_codes_batch" -ForegroundColor White

Write-Host "`n🎉 검증 완료! 현재 상태를 기반으로 설정을 확인했습니다." -ForegroundColor Green
Write-Host "" -ForegroundColor Green
Write-Host "다음 단계:" -ForegroundColor Cyan
Write-Host "1. 애플리케이션을 실행하여 기능 테스트: .\run-app.ps1" -ForegroundColor White
Write-Host "2. 관리자 페이지에서 테스트 투표 생성" -ForegroundColor White
Write-Host "3. 유권자 인증 및 투표 기능 테스트" -ForegroundColor White