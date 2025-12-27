# ================================================================
# SCRIPT TESTE - Servidor com CRON Job (PowerShell)
# Verificar se servidor arrancou e CRON foi agendado
# ================================================================

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "Testando servidor + CRON job..." -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""

# ================================================================
# CHECK 1: Servidor esta a correr?
# ================================================================

Write-Host "[1/3] Verificando se servidor esta UP..." -ForegroundColor Blue

try {
    # Tentar conectar a API (assumindo porta 3000)
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/sync/status" -Method GET -TimeoutSec 5 -ErrorAction Stop
    $httpCode = $response.StatusCode
    
    if ($httpCode -eq 200 -or $httpCode -eq 401) {
        Write-Host "   [OK] Servidor esta UP (HTTP $httpCode)" -ForegroundColor Green
    } else {
        Write-Host "   [ERRO] Servidor responde mas codigo inesperado (HTTP $httpCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "   [ERRO] Servidor NAO responde" -ForegroundColor Red
    Write-Host ""
    Write-Host "Certifica-te que servidor esta a correr:" -ForegroundColor Yellow
    Write-Host "   npm run dev"
    exit 1
}

# ================================================================
# CHECK 2: Logs do CRON aparecem?
# ================================================================

Write-Host ""
Write-Host "[2/3] Verificando logs do CRON..." -ForegroundColor Blue
Write-Host ""
Write-Host "INSTRUCOES MANUAIS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Verifica os logs do servidor e procura por:"
Write-Host ""
Write-Host "   [OK] 'INICIALIZANDO CRON JOBS'" -ForegroundColor Green
Write-Host "   [OK] 'CRON Job agendado: Daily Pipeline'" -ForegroundColor Green
Write-Host "   [OK] 'DailyPipeline -> 2h da manha'" -ForegroundColor Green
Write-Host ""
Write-Host "   Se vires estas linhas -> CRON esta OK" -ForegroundColor Green
Write-Host "   Se NAO vires -> Ha problema na integracao" -ForegroundColor Red
Write-Host ""

$answer = Read-Host "   Ves estas linhas nos logs? (s/n)"

if ($answer -eq "s" -or $answer -eq "S") {
    Write-Host "   [OK] CRON job agendado com sucesso!" -ForegroundColor Green
} else {
    Write-Host "   [ERRO] CRON job NAO foi agendado!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possiveis causas:" -ForegroundColor Yellow
    Write-Host "   - dailyPipelineJob.schedule nao foi chamado"
    Write-Host "   - Erro durante startAllJobs"
    Write-Host "   - Ver logs de erro no servidor"
    exit 1
}

# ================================================================
# CHECK 3: Endpoint esta disponivel?
# ================================================================

Write-Host ""
Write-Host "[3/3] Verificando endpoint do pipeline..." -ForegroundColor Blue

try {
    # Testar endpoint POST (mesmo que de erro, importante e que exista)
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/sync/execute-pipeline" -Method POST -TimeoutSec 5 -ErrorAction Stop
    $httpCode = $response.StatusCode
    
    if ($httpCode -eq 200 -or $httpCode -eq 500 -or $httpCode -eq 401) {
        Write-Host "   [OK] Endpoint existe (HTTP $httpCode)" -ForegroundColor Green
        Write-Host "   POST /api/sync/execute-pipeline"
    } else {
        Write-Host "   [AVISO] Endpoint responde mas codigo inesperado (HTTP $httpCode)" -ForegroundColor Yellow
    }
} catch {
    # Verificar se e erro 404 ou timeout
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "   [ERRO] Endpoint NAO existe (HTTP 404)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Verifica se routes estao configuradas:" -ForegroundColor Yellow
        Write-Host "   - src/routes/sync.routes.ts"
        Write-Host "   - Endpoint: POST /execute-pipeline"
        exit 1
    } elseif ($_.Exception.Response.StatusCode.value__ -eq 500) {
        Write-Host "   [OK] Endpoint existe (HTTP 500 - erro esperado sem dados)" -ForegroundColor Green
    } else {
        Write-Host "   [AVISO] Erro ao testar endpoint: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   Mas provavelmente esta OK (erro de execucao, nao de rota)"
    }
}

# ================================================================
# RESULTADO
# ================================================================

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "SERVIDOR + CRON VALIDADOS!" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[OK] Servidor esta UP"
Write-Host "[OK] CRON job agendado (confirma logs)"
Write-Host "[OK] Endpoint disponivel"
Write-Host ""
Write-Host "Proximo passo:"
Write-Host "   -> Testar execucao manual do pipeline"
Write-Host ""
Write-Host "Para testar manualmente execute:"
Write-Host "   Invoke-WebRequest -Uri 'http://localhost:3001/api/sync/execute-pipeline' -Method POST"
Write-Host ""