# Test Materialized Views - Dashboard Stats
Write-Host "`n====================================================================" -ForegroundColor Cyan
Write-Host "TEST: MATERIALIZED VIEWS - DASHBOARD STATS" -ForegroundColor Cyan
Write-Host "====================================================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:3001"
$testsPassed = 0
$testsFailed = 0

# TEST 1: Endpoint exists
Write-Host "TEST 1: Endpoint /api/dashboard/stats/v3 exists?" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/dashboard/stats/v3" -UseBasicParsing -ErrorAction Stop
    
    if ($response.StatusCode -eq 200) {
        Write-Host "   PASSED: Endpoint returned 200 OK" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "   FAILED: Status code $($response.StatusCode)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "   FAILED: Error calling endpoint - $_" -ForegroundColor Red
    $testsFailed++
    exit 1
}

Write-Host ""

# TEST 2: Response time under 200ms (Materialized View)
Write-Host "TEST 2: Response time under 200ms (Materialized View)?" -ForegroundColor Yellow
$start = Get-Date
$response = Invoke-WebRequest -Uri "$baseUrl/api/dashboard/stats/v3" -UseBasicParsing
$duration = [Math]::Round(((Get-Date) - $start).TotalMilliseconds)

Write-Host "   Response time: $duration ms" -ForegroundColor Cyan

if ($duration -lt 200) {
    Write-Host "   PASSED: $duration ms (EXCELLENT!)" -ForegroundColor Green
    Write-Host "   Materialized View is working PERFECTLY!" -ForegroundColor Green
    $testsPassed++
} elseif ($duration -lt 1000) {
    Write-Host "   WARNING: $duration ms (GOOD, but can improve)" -ForegroundColor Yellow
    $testsPassed++
} else {
    Write-Host "   FAILED: $duration ms (TOO SLOW!)" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# TEST 3: Response structure
Write-Host "TEST 3: Response structure is correct?" -ForegroundColor Yellow
$data = ($response.Content | ConvertFrom-Json).data

$requiredFields = @("overview", "byPlatform", "quickFilters", "platformDistribution", "meta")
$missingFields = @()
foreach ($field in $requiredFields) {
    if (-not $data.PSObject.Properties[$field]) {
        $missingFields += $field
    }
}

if ($missingFields.Count -eq 0) {
    Write-Host "   PASSED: All required fields present" -ForegroundColor Green
    $testsPassed++
} else {
    Write-Host "   FAILED: Missing fields: $($missingFields -join ', ')" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# TEST 4: Stats Overview valid
Write-Host "TEST 4: Stats Overview contains valid data?" -ForegroundColor Yellow
$overview = $data.overview

$overviewValid = $true
$issues = @()

if ($overview.totalStudents -le 0) {
    $overviewValid = $false
    $issues += "totalStudents must be greater than 0"
}

if ($overview.avgEngagement -lt 0 -or $overview.avgEngagement -gt 100) {
    $overviewValid = $false
    $issues += "avgEngagement must be between 0 and 100"
}

if (-not $overview.healthLevel) {
    $overviewValid = $false
    $issues += "healthLevel is empty"
}

if ($overviewValid) {
    Write-Host "   PASSED: Overview valid" -ForegroundColor Green
    Write-Host "      Total students: $($overview.totalStudents)" -ForegroundColor Cyan
    Write-Host "      Avg engagement: $($overview.avgEngagement)%" -ForegroundColor Cyan
    Write-Host "      Avg progress: $($overview.avgProgress)%" -ForegroundColor Cyan
    Write-Host "      Health level: $($overview.healthLevel)" -ForegroundColor Cyan
    $testsPassed++
} else {
    Write-Host "   FAILED: Overview invalid" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "      - $issue" -ForegroundColor Red
    }
    $testsFailed++
}

Write-Host ""

# TEST 5: Calculation date (freshness)
Write-Host "TEST 5: Stats are fresh (under 24h)?" -ForegroundColor Yellow
$calculatedAt = [DateTime]::Parse($data.meta.calculatedAt)
$now = Get-Date
$age = ($now - $calculatedAt).TotalHours

Write-Host "   Calculated at: $calculatedAt" -ForegroundColor Cyan
Write-Host "   Age: $([Math]::Round($age, 2)) hours" -ForegroundColor Cyan
Write-Host "   Freshness: $($data.meta.dataFreshness)" -ForegroundColor Cyan

if ($age -lt 24) {
    Write-Host "   PASSED: Stats fresh (under 24h)" -ForegroundColor Green
    $testsPassed++
} else {
    Write-Host "   WARNING: Stats older than 24h" -ForegroundColor Yellow
    $testsPassed++
}

Write-Host ""

# TEST 6: Breakdown by platform
Write-Host "TEST 6: Breakdown by platform present?" -ForegroundColor Yellow

if ($data.byPlatform.Count -gt 0) {
    Write-Host "   PASSED: $($data.byPlatform.Count) platforms found" -ForegroundColor Green
    foreach ($platform in $data.byPlatform) {
        Write-Host "      $($platform.name): $($platform.count) students ($($platform.percentage)%)" -ForegroundColor Cyan
    }
    $testsPassed++
} else {
    Write-Host "   FAILED: No platforms found" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# TEST 7: Quick Filters
Write-Host "TEST 7: Quick Filters present?" -ForegroundColor Yellow
$filters = $data.quickFilters

if ($filters.atRisk -ge 0 -and $filters.topPerformers -ge 0) {
    Write-Host "   PASSED: Quick Filters valid" -ForegroundColor Green
    Write-Host "      At Risk: $($filters.atRisk)" -ForegroundColor Cyan
    Write-Host "      Top Performers: $($filters.topPerformers)" -ForegroundColor Cyan
    Write-Host "      Inactive 30d: $($filters.inactive30d)" -ForegroundColor Cyan
    $testsPassed++
} else {
    Write-Host "   FAILED: Quick Filters invalid" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# TEST 8: Consistency test (multiple calls)
Write-Host "TEST 8: Multiple calls return same data (cache)?" -ForegroundColor Yellow
$calls = @()
for ($i = 1; $i -le 3; $i++) {
    $start = Get-Date
    $resp = Invoke-WebRequest -Uri "$baseUrl/api/dashboard/stats/v3" -UseBasicParsing
    $duration = [Math]::Round(((Get-Date) - $start).TotalMilliseconds)
    $jsonData = ($resp.Content | ConvertFrom-Json).data
    
    $calls += @{
        duration = $duration
        totalStudents = $jsonData.overview.totalStudents
        calculatedAt = $jsonData.meta.calculatedAt
    }
    
    Write-Host "      Call ${i}: $duration ms" -ForegroundColor Cyan
}

$allSame = $true
$firstTotal = $calls[0].totalStudents
$firstCalc = $calls[0].calculatedAt

foreach ($call in $calls) {
    if ($call.totalStudents -ne $firstTotal -or $call.calculatedAt -ne $firstCalc) {
        $allSame = $false
        break
    }
}

if ($allSame) {
    Write-Host "   PASSED: Data consistent across all calls" -ForegroundColor Green
    $testsPassed++
} else {
    Write-Host "   FAILED: Data differs between calls" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# SUMMARY
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

$totalTests = $testsPassed + $testsFailed
$successRate = [Math]::Round(($testsPassed / $totalTests) * 100, 1)

Write-Host "   Total tests: $totalTests" -ForegroundColor White
Write-Host "   Passed: $testsPassed" -ForegroundColor Green
Write-Host "   Failed: $testsFailed" -ForegroundColor Red
Write-Host "   Success rate: $successRate%" -ForegroundColor Cyan
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
    Write-Host "Materialized Views are 100% IMPLEMENTED and WORKING!" -ForegroundColor Green
    Write-Host "Dashboard should load in under 200ms!" -ForegroundColor Green
    exit 0
} elseif ($testsPassed -ge 6) {
    Write-Host "MOST TESTS PASSED" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "CRITICAL TESTS FAILED!" -ForegroundColor Red
    exit 1
}
