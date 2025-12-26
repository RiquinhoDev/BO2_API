# TESTE_COMPLETO_CRON.ps1
# PowerShell 5.1+ (funciona também em PowerShell 7+)

$ErrorActionPreference = "Stop"

# --------- CONFIG ---------
$baseUrl     = "http://localhost:3001/api"
$cronTagsUrl = "$baseUrl/cron-tags"
$cronJobsUrl = "$baseUrl/cron"

# --------- HELPERS ---------
function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host $Title -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-SubSection {
    param([string]$Title)
    Write-Host ""
    Write-Host $Title -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------" -ForegroundColor Yellow
    Write-Host ""
}

function Invoke-Test {
    param(
        [string]$Title,
        [scriptblock]$Action,
        [int]$SleepSeconds = 1
    )

    Write-Host $Title -ForegroundColor Green
    try {
        $result = & $Action
        if ($null -ne $result) {
            Write-Host "OK" -ForegroundColor Green
            # Mostra JSON bonito quando possível
            try {
                $result | ConvertTo-Json -Depth 10
            } catch {
                $result
            }
        } else {
            Write-Host "OK (sem output)" -ForegroundColor Green
        }
    } catch {
        Write-Host ("ERRO: " + $_.Exception.Message) -ForegroundColor Red
    }

    if ($SleepSeconds -gt 0) { Start-Sleep -Seconds $SleepSeconds }
}

# --------- HEADER ---------
Write-Section "TESTE COMPLETO - CRON MANAGEMENT SYSTEM"

# ======================================================================
# PARTE 1: SISTEMA DE TAGS AC
# ======================================================================
Write-SubSection "PARTE 1: SISTEMA DE TAGS AC"

# TEST 1
Invoke-Test "TEST 1: GET /api/cron-tags/config" {
    Invoke-RestMethod -Uri "$cronTagsUrl/config" -Method GET
}

# TEST 2
Invoke-Test "TEST 2: GET /api/cron-tags/status" {
    Invoke-RestMethod -Uri "$cronTagsUrl/status" -Method GET
}

# TEST 3
Invoke-Test "TEST 3: POST /api/cron-tags/validate" {
    $body = @{
        cronExpression = "0 2 * * *"
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$cronTagsUrl/validate" -Method POST -ContentType "application/json" -Body $body
}

# TEST 4
Invoke-Test "TEST 4: GET /api/cron-tags/history?limit=5" {
    Invoke-RestMethod -Uri "$cronTagsUrl/history?limit=5" -Method GET
}

# TEST 5
Invoke-Test "TEST 5: GET /api/cron-tags/statistics?days=30" {
    Invoke-RestMethod -Uri "$cronTagsUrl/statistics?days=30" -Method GET
} 0

# ======================================================================
# PARTE 2: SISTEMA DE JOBS UTILIZADORES
# ======================================================================
Write-SubSection "PARTE 2: SISTEMA DE JOBS UTILIZADORES"

# TEST 6
Invoke-Test "TEST 6: POST /api/cron/validate" {
    $body = @{
        cronExpression = "0 3 * * *"
        timezone       = "Europe/Lisbon"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$cronJobsUrl/validate" -Method POST -ContentType "application/json" -Body $body

    # Output friendly extra (sem quebrar)
    if ($response) {
        Write-Host ("   valida: " + $response.valid) -ForegroundColor Cyan
        if ($response.humanReadable) {
            Write-Host ("   legivel: " + $response.humanReadable) -ForegroundColor Cyan
        }
    }

    $response
}

# TEST 7 - Create Job
$jobId = $null
Invoke-Test "TEST 7: POST /api/cron/jobs (Criar Job)" {
    $timestamp = Get-Date -Format "HHmmss"

    $jobData = @{
        name          = "Teste-$timestamp"
        description   = "Job de teste"
        syncType      = "hotmart"
        cronExpression= "0 4 * * *"
        timezone      = "Europe/Lisbon"
        syncConfig    = @{
            fullSync        = $true
            includeProgress = $true
            batchSize       = 500
        }
    }

    $body = $jobData | ConvertTo-Json -Depth 10
    $response = Invoke-RestMethod -Uri "$cronJobsUrl/jobs" -Method POST -ContentType "application/json" -Body $body

    if ($response -and $response.job -and $response.job._id) {
        $script:jobId = $response.job._id
        Write-Host ("   id: " + $script:jobId) -ForegroundColor Cyan
    } else {
        Write-Host "   aviso: nao foi possivel obter response.job._id" -ForegroundColor Yellow
    }

    $response
} 2

# TEST 8
Invoke-Test "TEST 8: GET /api/cron/jobs" {
    $response = Invoke-RestMethod -Uri "$cronJobsUrl/jobs" -Method GET
    if ($response -and $response.stats) {
        Write-Host ("   total: " + $response.stats.total) -ForegroundColor Cyan
    }
    $response
}

# TEST 9 - Get by ID
if ($jobId) {
    Invoke-Test "TEST 9: GET /api/cron/jobs/$jobId" {
        $response = Invoke-RestMethod -Uri "$cronJobsUrl/jobs/$jobId" -Method GET
        if ($response -and $response.job -and $response.job.name) {
            Write-Host ("   nome: " + $response.job.name) -ForegroundColor Cyan
        }
        $response
    }
} else {
    Write-Host "TEST 9: SKIP (jobId vazio)" -ForegroundColor Yellow
}

# TEST 10 - Update
if ($jobId) {
    Invoke-Test "TEST 10: PUT /api/cron/jobs/$jobId (Atualizar)" {
        $updateData = @{
            description   = "Job ATUALIZADO"
            cronExpression= "0 5 * * *"
        }

        $body = $updateData | ConvertTo-Json
        Invoke-RestMethod -Uri "$cronJobsUrl/jobs/$jobId" -Method PUT -ContentType "application/json" -Body $body
    }
} else {
    Write-Host "TEST 10: SKIP (jobId vazio)" -ForegroundColor Yellow
}

# TEST 11 - Toggle
if ($jobId) {
    Invoke-Test "TEST 11: POST /api/cron/jobs/$jobId/toggle (Desativar)" {
        $body = @{ enabled = $false } | ConvertTo-Json
        Invoke-RestMethod -Uri "$cronJobsUrl/jobs/$jobId/toggle" -Method POST -ContentType "application/json" -Body $body
    }
} else {
    Write-Host "TEST 11: SKIP (jobId vazio)" -ForegroundColor Yellow
}

# TEST 12
Invoke-Test "TEST 12: GET /api/cron/status" {
    $response = Invoke-RestMethod -Uri "$cronJobsUrl/status" -Method GET
    if ($response -and $response.stats) {
        Write-Host ("   total jobs: " + $response.stats.totalJobs) -ForegroundColor Cyan
    }
    $response
}

# TEST 13 - Delete (cleanup)
if ($jobId) {
    Invoke-Test "TEST 13: DELETE /api/cron/jobs/$jobId (Cleanup)" {
        Invoke-RestMethod -Uri "$cronJobsUrl/jobs/$jobId" -Method DELETE
    } 0
} else {
    Write-Host "TEST 13: SKIP (jobId vazio)" -ForegroundColor Yellow
}

# --------- RESUMO ---------
Write-Section "TESTES CONCLUIDOS"
Write-Host "13 testes executados (alguns podem ser SKIP se jobId falhar)" -ForegroundColor Yellow
Write-Host "INFO: Verifica os resultados acima" -ForegroundColor Blue
Write-Host ""
