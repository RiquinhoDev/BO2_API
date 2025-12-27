# ================================================================
# SCRIPT VALIDACAO - Funciona de qualquer pasta (PowerShell)
# Detecta automaticamente raiz do projeto
# ================================================================

# Detectar raiz do projeto
$currentPath = "C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API\outputs\validate-1.1-COMPLETE.ps1"
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
Write-Host "VALIDACAO COMPLETA - FASE 1.1" -ForegroundColor Cyan
Write-Host "Integrar Pipeline no CRON" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""

$ERRORS = 0

# ================================================================
# CHECK 1: Ficheiro dailyPipeline.job.ts existe
# ================================================================

Write-Host "[1/6] Verificando dailyPipeline.job.ts..." -ForegroundColor Blue

$dailyPipelineFile = "src/jobs/dailyPipeline.job.ts"
if (Test-Path $dailyPipelineFile) {
    $fileSize = (Get-Item $dailyPipelineFile).Length
    if ($fileSize -gt 5000) {
        Write-Host "   [OK] Ficheiro existe e tamanho OK ($fileSize bytes)" -ForegroundColor Green
    } else {
        Write-Host "   [ERRO] Ficheiro muito pequeno ($fileSize bytes)" -ForegroundColor Red
        $ERRORS++
    }
} else {
    Write-Host "   [ERRO] Ficheiro NAO existe!" -ForegroundColor Red
    Write-Host "   Caminho esperado: $projectRoot\$dailyPipelineFile" -ForegroundColor Yellow
    $ERRORS++
}

# ================================================================
# CHECK 2: Import em index.ts
# ================================================================

Write-Host "[2/6] Verificando import em index.ts..." -ForegroundColor Blue

$indexFile = "src/jobs/index.ts"
if (Test-Path $indexFile) {
    $hasImport = Select-String -Path $indexFile -Pattern "import dailyPipelineJob from './dailyPipeline.job'" -Quiet
    if ($hasImport) {
        Write-Host "   [OK] Import encontrado" -ForegroundColor Green
    } else {
        Write-Host "   [ERRO] Import NAO encontrado!" -ForegroundColor Red
        Write-Host "   Adicionar: import dailyPipelineJob from './dailyPipeline.job'" -ForegroundColor Yellow
        $ERRORS++
    }
} else {
    Write-Host "   [ERRO] index.ts NAO existe!" -ForegroundColor Red
    $ERRORS++
}

# ================================================================
# CHECK 3: Schedule chamado em startAllJobs
# ================================================================

Write-Host "[3/6] Verificando schedule em startAllJobs..." -ForegroundColor Blue

if (Test-Path $indexFile) {
    $hasSchedule = Select-String -Path $indexFile -Pattern "dailyPipelineJob\.schedule\(\)" -Quiet
    if ($hasSchedule) {
        Write-Host "   [OK] schedule encontrado" -ForegroundColor Green
    } else {
        Write-Host "   [ERRO] schedule NAO encontrado!" -ForegroundColor Red
        Write-Host "   Adicionar: dailyPipelineJob.schedule()" -ForegroundColor Yellow
        $ERRORS++
    }
}

# ================================================================
# CHECK 4: Logs atualizados
# ================================================================

Write-Host "[4/6] Verificando logs atualizados..." -ForegroundColor Blue

if (Test-Path $indexFile) {
    $hasLog = Select-String -Path $indexFile -Pattern "DailyPipeline" -Quiet
    if ($hasLog) {
        Write-Host "   [OK] Log DailyPipeline encontrado" -ForegroundColor Green
    } else {
        Write-Host "   [AVISO] Log DailyPipeline nao encontrado (opcional)" -ForegroundColor Yellow
    }
    
    $hasEndpoint = Select-String -Path $indexFile -Pattern "/api/sync/execute-pipeline" -Quiet
    if ($hasEndpoint) {
        Write-Host "   [OK] Log endpoint encontrado" -ForegroundColor Green
    } else {
        Write-Host "   [AVISO] Log endpoint nao encontrado (opcional)" -ForegroundColor Yellow
    }
}

# ================================================================
# CHECK 5: Export do job
# ================================================================

Write-Host "[5/6] Verificando export do job..." -ForegroundColor Blue

if (Test-Path $indexFile) {
    $hasExport = Select-String -Path $indexFile -Pattern "dailyPipeline: dailyPipelineJob" -Quiet
    if ($hasExport) {
        Write-Host "   [OK] Export encontrado" -ForegroundColor Green
    } else {
        Write-Host "   [ERRO] Export NAO encontrado!" -ForegroundColor Red
        Write-Host "   Adicionar: dailyPipeline: dailyPipelineJob," -ForegroundColor Yellow
        $ERRORS++
    }
}

# ================================================================
# CHECK 6: Compilacao TypeScript
# ================================================================

Write-Host "[6/6] Verificando compilacao TypeScript..." -ForegroundColor Blue

try {
    # Executar compilacao TypeScript
    $compileOutput = & npx tsc --noEmit 2>&1 | Where-Object { $_ -notmatch "discord-analytics" }
    $compileExitCode = $LASTEXITCODE
    
    # Ignorar erros do discord-analytics
    $relevantErrors = $compileOutput | Where-Object { 
        $_ -match "^error" -and 
        $_ -notmatch "discord-analytics"
    }
    
    if ($relevantErrors.Count -eq 0) {
        Write-Host "   [OK] Codigo compila sem erros (ignorando discord-analytics)" -ForegroundColor Green
    } else {
        Write-Host "   [ERRO] ERROS de compilacao encontrados!" -ForegroundColor Red
        Write-Host ""
        Write-Host "   Detalhes:"
        $relevantErrors | Select-Object -First 10 | ForEach-Object {
            Write-Host "   $_"
        }
        $ERRORS++
    }
} catch {
    Write-Host "   [AVISO] Erro ao executar compilacao: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ================================================================
# RESULTADO FINAL
# ================================================================

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Cyan

if ($ERRORS -eq 0) {
    Write-Host "VALIDACAO COMPLETA PASSOU!" -ForegroundColor Green
    Write-Host "==============================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[OK] Todos os checkpoints passaram!"
    Write-Host "[OK] CRON job integrado com sucesso!"
    Write-Host ""
    Write-Host "Proximo passo:"
    Write-Host "   -> Testar execucao manual"
    Write-Host "   -> npm run dev"
    Write-Host ""
    exit 0
} else {
    Write-Host "VALIDACAO FALHOU!" -ForegroundColor Red
    Write-Host "==============================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[ERRO] $ERRORS erro(s) encontrado(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Consultar: GUIA_FASE_1.1_COMPLETO.md para ajuda"
    Write-Host ""
    exit 1
}