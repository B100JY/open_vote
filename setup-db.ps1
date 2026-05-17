# Open Vote - 데이터베이스 설정 스크립트
# Supabase REST API 를 통해 SQL 실행

$PROJECT_REF = "zxrwlwhbcivwpvmktuoj"
$SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cndsd2hiY2l2d3B2bWt0dW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODE0Mjg5OSwiZXhwIjoyMDkzNzE4ODk5fQ.KuOpTaLcQFHZLzmSPo7Jwg6ZV5f7y4tlJXsJDDRYMEM"
$SQL_FILE = "supabase\setup.sql"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Open Vote - 데이터베이스 설정" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# SQL 파일 읽기
Write-Host "[1/2] SQL 파일 읽는 중..." -ForegroundColor Yellow

if (!(Test-Path $SQL_FILE)) {
    Write-Host "  ✗ SQL 파일을 찾을 수 없습니다: $SQL_FILE" -ForegroundColor Red
    exit 1
}

$sqlContent = Get-Content $SQL_FILE -Raw
Write-Host "  ✓ SQL 파일 읽음 ($($sqlContent.Length) bytes)" -ForegroundColor Green

# Supabase REST API 로 SQL 실행
Write-Host ""
Write-Host "[2/2] 데이터베이스에 SQL 실행 중..." -ForegroundColor Yellow
Write-Host "  프로젝트: $PROJECT_REF" -ForegroundColor Gray

$headers = @{
    "apikey" = $SERVICE_ROLE_KEY
    "Authorization" = "Bearer $SERVICE_ROLE_KEY"
    "Content-Type" = "application/sql"
    "Prefer" = "return=representation"
}

try {
    # SQL 을 여러 스테이트먼트로 나누어 실행 (세미콜론 기준)
    $statements = $sqlContent -split ';' | Where-Object { $_.Trim() -ne '' -and !$_.Trim().StartsWith('--') }
    
    $successCount = 0
    $totalCount = $statements.Count
    
    Write-Host "  총 $totalCount 개 스테이트먼트 실행..." -ForegroundColor Gray
    Write-Host ""
    
    foreach ($stmt in $statements) {
        $trimmedStmt = $stmt.Trim()
        if ($trimmedStmt -eq '' -or $trimmedStmt.StartsWith('--')) {
            continue
        }
        
        try {
            $response = Invoke-RestMethod -Uri "https://$PROJECT_REF.supabase.co/rest/v1/rpc/exec_sql" -Method Post -Headers $headers -Body $trimmedStmt -ErrorAction Stop
            $successCount++
            Write-Host "  ✓ 스테이트먼트 실행 완료 ($successCount/$totalCount)" -ForegroundColor Green
        } catch {
            $errorBody = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($errorBody)
            $errorResponse = $reader.ReadToEnd()
            
            if ($errorResponse -like '*already exists*' -or $errorResponse -like '*Duplicate*' -or $errorResponse -like '*conflict*') {
                Write-Host "  ⚠ 이미 존재함 (무시) ($successCount/$totalCount)" -ForegroundColor Yellow
                $successCount++
            } else {
                Write-Host "  ✗ 오류 발생: $($_.Exception.Message)" -ForegroundColor Red
                Write-Host "     SQL: $($trimmedStmt.Substring(0, [Math]::Min(50, $trimmedStmt.Length)))..." -ForegroundColor Gray
            }
        }
    }
    
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "  설정 완료: $successCount/$totalCount 개 성공" -ForegroundColor Green
    Write-Host "======================================" -ForegroundColor Cyan
    
} catch {
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Red
    Write-Host "  오류 발생: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "======================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "대체 방법:" -ForegroundColor Cyan
    Write-Host "  1. https://app.supabase.com/project/$PROJECT_REF/sql/new 로 이동" -ForegroundColor White
    Write-Host "  2. $SQL_FILE 파일 내용을 복사하여 붙여넣기" -ForegroundColor White
    Write-Host "  3. RUN 버튼 클릭" -ForegroundColor White
    Write-Host ""
    
    exit 1
}

Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Cyan
Write-Host "  1. Edge Functions 배포: supabase functions deploy cast_vote" -ForegroundColor White
Write-Host "  2. Edge Functions 배포: supabase functions deploy generate_voter_codes" -ForegroundColor White
Write-Host "  3. 앱 실행: .\run-app.ps1" -ForegroundColor White
Write-Host ""
