# ================================================================
# SCRIPT INVESTIGACAO - Jobs Duplicados (PowerShell)
# Detecta automaticamente raiz do projeto
# ================================================================

# Detectar raiz do projeto
$currentPath = Get-Location
$projectRoot = $null

# Procurar por package.json subindo diretorios
$searchPath = $currentPath
while ($searchPath.Path -ne $searchPath.Root) {
    if (Test-Path (Join-Path $searchPath "package.json")) {
        $projectRoot = $searchPath
        break
    }
    $searchPath = Split-Path $searchPath
}

if (-not $projectRoot) {
    Write-Host "[ERRO] Nao consegui encontrar raiz do projeto!" -ForegroundColor Red
    Write-Host "Certifica-te que estas dentro do projeto BO2_API" -ForegroundColor Yellow
    exit 1
}

# Navegar para raiz
Set-Location $projectRoot
Write-Host "Raiz do projeto: $projectRoot" -ForegroundColor Cyan
Write-Host ""

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "INVESTIGACAO DE JOBS DUPLICADOS" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""

# ================================================================
# INVESTIGACAO 1: evaluateEngagementV2.job.ts
# ================================================================

Write-Host "[1/4] Investigando evaluateEngagementV2.job.ts..." -ForegroundColor Blue
Write-Host ""

$file1 = "src/jobs/evaluateEngagementV2.job.ts"
if (Test-Path $file1) {
    Write-Host "   Ficheiro existe"
    
    # Ver schedule
    $schedule = Select-String -Path $file1 -Pattern "cron.schedule" | Select-Object -First 1
    if ($schedule) {
        Write-Host "   Schedule: $($schedule.Line.Trim())"
    }
    
    # Verificar se e chamado em index.ts
    $usedInIndex = Select-String -Path "src/jobs/index.ts" -Pattern "evaluateEngagementV2" -Quiet -ErrorAction SilentlyContinue
    if ($usedInIndex) {
        Write-Host "   [AVISO] E USADO em index.ts" -ForegroundColor Yellow
    } else {
        Write-Host "   [OK] NAO e usado em index.ts" -ForegroundColor Green
    }
    
    # Verificar imports em outros ficheiros
    $imports = @(Get-ChildItem -Path "src" -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue | 
        Select-String -Pattern "evaluateEngagementV2" -ErrorAction SilentlyContinue).Count
    
    if ($imports -gt 1) {
        Write-Host "   [AVISO] Importado em $imports ficheiros" -ForegroundColor Yellow
    } else {
        Write-Host "   [OK] Nao e importado noutros ficheiros" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "   RECOMENDACAO:" -ForegroundColor Yellow
    if ($imports -le 1) {
        Write-Host "   [REMOVER] PODE REMOVER (duplica dailyPipeline)" -ForegroundColor Green
        Write-Host "   Motivo: dailyPipeline.job.ts ja faz recalc engagement" -ForegroundColor Yellow
    } else {
        Write-Host "   [VERIFICAR] Verificar manualmente antes de remover" -ForegroundColor Yellow
    }
} else {
    Write-Host "   [OK] Ficheiro NAO existe (ja foi removido)" -ForegroundColor Green
}

Write-Host ""
Write-Host "--------------------------------------------------------------"
Write-Host ""

# ================================================================
# INVESTIGACAO 2: rebuildProductSalesStats.job.ts
# ================================================================

Write-Host "[2/4] Investigando rebuildProductSalesStats.job.ts..." -ForegroundColor Blue
Write-Host ""

$file2 = "src/jobs/rebuildProductSalesStats.job.ts"
if (Test-Path $file2) {
    Write-Host "   Ficheiro existe"
    
    # Verificar se e chamado em index.ts
    $usedInIndex = Select-String -Path "src/jobs/index.ts" -Pattern "rebuildProductSalesStats" -Quiet -ErrorAction SilentlyContinue
    if ($usedInIndex) {
        Write-Host "   [AVISO] E USADO em index.ts" -ForegroundColor Yellow
    } else {
        Write-Host "   [OK] NAO e usado em index.ts" -ForegroundColor Green
    }
    
    # Verificar imports
    $imports = @(Get-ChildItem -Path "src" -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue | 
        Select-String -Pattern "rebuildProductSalesStats" -ErrorAction SilentlyContinue).Count
    
    if ($imports -gt 1) {
        Write-Host "   [AVISO] Importado em $imports ficheiros" -ForegroundColor Yellow
    } else {
        Write-Host "   [OK] Nao e importado noutros ficheiros" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "   RECOMENDACAO:" -ForegroundColor Yellow
    if ($imports -le 1) {
        Write-Host "   [REMOVER] PROVAVELMENTE pode remover (parece deprecated)" -ForegroundColor Yellow
    } else {
        Write-Host "   [MANTER] VERIFICAR - ainda e usado" -ForegroundColor Red
    }
} else {
    Write-Host "   [OK] Ficheiro NAO existe" -ForegroundColor Green
}

Write-Host ""
Write-Host "--------------------------------------------------------------"
Write-Host ""

# ================================================================
# INVESTIGACAO 3: precompute.job.ts
# ================================================================

Write-Host "[3/4] Investigando precompute.job.ts..." -ForegroundColor Blue
Write-Host ""

$file3 = "src/jobs/precompute.job.ts"
if (Test-Path $file3) {
    Write-Host "   Ficheiro existe"
    
    # Mostrar primeiras 20 linhas
    Write-Host ""
    Write-Host "   Primeiras 20 linhas:"
    Write-Host "   ----------------------------------------------------"
    Get-Content $file3 -TotalCount 20 -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "   $_"
    }
    Write-Host "   ----------------------------------------------------"
    Write-Host ""
    
    # Verificar se e usado
    $usedInIndex = Select-String -Path "src/jobs/index.ts" -Pattern "precompute" -Quiet -ErrorAction SilentlyContinue
    if ($usedInIndex) {
        Write-Host "   [AVISO] E USADO em index.ts" -ForegroundColor Yellow
    } else {
        Write-Host "   [OK] NAO e usado em index.ts" -ForegroundColor Green
    }
    
    # Ver schedule
    $schedule = Select-String -Path $file3 -Pattern "cron.schedule" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($schedule) {
        Write-Host "   Schedule: $($schedule.Line.Trim())"
    }
    
    Write-Host ""
    Write-Host "   RECOMENDACAO:" -ForegroundColor Yellow
    Write-Host "   [MANTER] Parece ser job independente (a cada 30 min)" -ForegroundColor Green
    Write-Host "   Funcao: Precomputa metricas de utilizadores" -ForegroundColor Cyan
} else {
    Write-Host "   [OK] Ficheiro NAO existe" -ForegroundColor Green
}

Write-Host ""
Write-Host "--------------------------------------------------------------"
Write-Host ""

# ================================================================
# INVESTIGACAO 4: Cleanup jobs
# ================================================================

Write-Host "[4/4] Investigando cleanup jobs..." -ForegroundColor Blue
Write-Host ""

$cleanup1 = "src/jobs/cleanupHistory.job.ts"
$cleanup2 = "src/jobs/cronExecutionCleanup.job.ts"

$hasCleanup1 = Test-Path $cleanup1
$hasCleanup2 = Test-Path $cleanup2

if ($hasCleanup1) {
    Write-Host "   cleanupHistory.job.ts existe"
    
    # Ver o que limpa
    Write-Host "   Limpa: CommunicationHistory antigo"
} else {
    Write-Host "   [OK] cleanupHistory.job.ts NAO existe" -ForegroundColor Green
}

Write-Host ""

if ($hasCleanup2) {
    Write-Host "   cronExecutionCleanup.job.ts existe"
    
    # Ver o que limpa
    Write-Host "   Limpa: CronExecution antigo"
} else {
    Write-Host "   [OK] cronExecutionCleanup.job.ts NAO existe" -ForegroundColor Green
}

Write-Host ""
Write-Host "   RECOMENDACAO:" -ForegroundColor Yellow
if ($hasCleanup1 -and $hasCleanup2) {
    Write-Host "   [CONSOLIDAR] Juntar ambos em maintenance.job.ts" -ForegroundColor Yellow
} elseif ($hasCleanup1 -or $hasCleanup2) {
    Write-Host "   [MANTER] So existe 1 cleanup job - OK" -ForegroundColor Green
} else {
    Write-Host "   [OK] Nenhum cleanup job encontrado" -ForegroundColor Green
}

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""

# ================================================================
# RESUMO FINAL
# ================================================================

Write-Host "RESUMO DA INVESTIGACAO:" -ForegroundColor Green
Write-Host ""
Write-Host "Jobs que PROVAVELMENTE podem ser removidos/consolidados:"
Write-Host ""

$podeRemover = @()

# Check evaluateEngagementV2
if (Test-Path "src/jobs/evaluateEngagementV2.job.ts") {
    $imports = @(Get-ChildItem -Path "src" -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue | 
        Select-String -Pattern "evaluateEngagementV2" -ErrorAction SilentlyContinue).Count
    if ($imports -le 1) {
        $podeRemover += "evaluateEngagementV2.job.ts"
        Write-Host "  [X] evaluateEngagementV2.job.ts" -ForegroundColor Yellow
        Write-Host "      Motivo: Duplica dailyPipeline (ambos fazem engagement)" -ForegroundColor Cyan
    }
}

# Check rebuildProductSalesStats
if (Test-Path "src/jobs/rebuildProductSalesStats.job.ts") {
    $imports = @(Get-ChildItem -Path "src" -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue | 
        Select-String -Pattern "rebuildProductSalesStats" -ErrorAction SilentlyContinue).Count
    if ($imports -le 1) {
        $podeRemover += "rebuildProductSalesStats.job.ts"
        Write-Host "  [?] rebuildProductSalesStats.job.ts" -ForegroundColor Yellow
        Write-Host "      Motivo: Nao parece ser usado (verificar manualmente)" -ForegroundColor Cyan
    }
}

# Cleanup jobs
if ((Test-Path $cleanup1) -and (Test-Path $cleanup2)) {
    $podeRemover += "cleanup-consolidar"
    Write-Host "  [CONSOLIDAR] cleanupHistory.job.ts + cronExecutionCleanup.job.ts" -ForegroundColor Yellow
    Write-Host "      Motivo: Podem ser 1 so ficheiro (maintenance.job.ts)" -ForegroundColor Cyan
}

Write-Host ""

if ($podeRemover.Count -eq 0) {
    Write-Host "[OK] Nenhum job duplicado encontrado!" -ForegroundColor Green
} else {
    Write-Host "Total: $($podeRemover.Count) otimizacao(oes) possivel(is)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "DECISAO RECOMENDADA:"
Write-Host ""
Write-Host "1. REMOVER: evaluateEngagementV2.job.ts" -ForegroundColor Yellow
Write-Host "   -> dailyPipeline ja faz recalc engagement"
Write-Host ""
Write-Host "2. INVESTIGAR: rebuildProductSalesStats.job.ts" -ForegroundColor Yellow
Write-Host "   -> Parece deprecated mas verificar primeiro"
Write-Host ""
Write-Host "3. MANTER: precompute.job.ts" -ForegroundColor Green
Write-Host "   -> Job independente util (precomputa metricas)"
Write-Host ""
Write-Host "4. OPCIONAL: Consolidar cleanup jobs" -ForegroundColor Cyan
Write-Host "   -> Juntar em 1 ficheiro mais tarde"
Write-Host ""
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Consultar: ANALISE_JOBS_LIMPEZA.md para mais detalhes"
Write-Host ""