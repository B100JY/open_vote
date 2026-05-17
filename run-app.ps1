# Open Vote - Application Runner Script
# This script runs the Open Vote application with the correct environment variables

Write-Host "Open Vote - 애플리케이션 실행 스크립트" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

# Check if Flutter is installed
if (!(Get-Command flutter -ErrorAction SilentlyContinue)) {
    Write-Host "Flutter가 설치되지 않았습니다. 먼저 Flutter를 설치해주세요." -ForegroundColor Red
    exit 1
}

# Load environment variables from .env.local if it exists
$envFilePath = Join-Path $PSScriptRoot ".env.local"
if (Test-Path $envFilePath) {
    Write-Host "환경 파일을 로드합니다: $envFilePath" -ForegroundColor Cyan
    Get-Content $envFilePath | ForEach-Object {
        if ($_) {
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
    Write-Host ".env.local 파일을 찾을 수 없습니다." -ForegroundColor Yellow
    Write-Host "다음 명령어로 .env.local 파일을 생성해주세요:" -ForegroundColor White
    Write-Host "  Copy-Item .env.example .env.local" -ForegroundColor White
    Write-Host "" -ForegroundColor White
    Write-Host "그리고 .env.local 파일을 열어 실제 Supabase 키로 업데이트하세요." -ForegroundColor Yellow
    exit 1
}

# Check required environment variables
$requiredVars = @("SUPABASE_URL", "SUPABASE_ANON_KEY")
$missingVars = @()

foreach ($var in $requiredVars) {
    if (-not (Test-Path "env:$var") -or (Get-Item "env:$var").Value -eq "") {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host "필수 환경 변수가 누락되었습니다:" -ForegroundColor Red
    foreach ($var in $missingVars) {
        Write-Host "  - $var" -ForegroundColor Red
    }
    exit 1
}

Write-Host "`n필수 환경 변수가 모두 설정되었습니다." -ForegroundColor Green

# Run the application
Write-Host "`nFlutter 애플리케이션을 실행합니다..." -ForegroundColor Cyan
Write-Host "대상: Web (Chrome)" -ForegroundColor White

flutter run -d chrome `
  --dart-define=SUPABASE_URL=$env:SUPABASE_URL `
  --dart-define=SUPABASE_ANON_KEY=$env:SUPABASE_ANON_KEY

if ($LASTEXITCODE -ne 0) {
    Write-Host "애플리케이션 실행에 실패했습니다." -ForegroundColor Red
    exit $LASTEXITCODE
} else {
    Write-Host "`nOpen Vote 애플리케이션이 성공적으로 실행되었습니다!" -ForegroundColor Green
}