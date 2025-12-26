# ================================================================
# TESTE AUTOMATICO - SISTEMA CRON HISTORICO (PS 5.1 COMPATIVEL)
# ================================================================

$ErrorActionPreference = "Continue"
$API_URL = "http://localhost:3001"

# ---------- OUTPUT HELPERS (ASCII only) ----------
function Write-Success { param([string]$msg) Write-Host "[OK]  $msg" -ForegroundColor Green }
function Write-Error   { param([string]$msg) Write-Host "[ERR] $msg" -ForegroundColor Red }
function Write-Info    { param([string]$msg) Write-Host "[INF] $msg" -ForegroundColor Cyan }
function Write-Warn    { param([string]$msg) Write-Host "[WRN] $msg" -ForegroundColor Yellow }
function Write-Section {
  param([string]$msg)
  Write-Host ""
  Write-Host ("=" * 70) -ForegroundColor Blue
  Write-Host ("[SECTION] " + $msg) -ForegroundColor Blue
  Write-Host ("=" * 70) -ForegroundColor Blue
}

# Contadores
$totalTests  = 0
$passedTests = 0
$failedTests = 0

function Test-Endpoint {
  param(
    [string]$Name,
    [string]$Url,
    [string]$Method = "GET",
    [object]$Body = $null,
    [scriptblock]$CustomValidation = $null
  )

  $script:totalTests++

  try {
    Write-Host ""
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    Write-Info ("TESTE {0}: {1}" -f $script:totalTests, $Name)
    Write-Info ("URL    : {0}" -f $Url)
    Write-Info ("Metodo : {0}" -f $Method)

    $params = @{
      Uri         = $Url
      Method      = $Method
      ContentType = "application/json"
      TimeoutSec  = 120
    }

    if ($null -ne $Body) {
      $params.Body = ($Body | ConvertTo-Json -Depth 10)
      $previewLen = [Math]::Min(120, $params.Body.Length)
      Write-Info ("Body   : {0}..." -f $params.Body.Substring(0, $previewLen))
    }

    $response = Invoke-RestMethod @params -ErrorAction Stop
    Write-Success "Response recebida com sucesso!"

    if ($CustomValidation) {
      $validationResult = & $CustomValidation $response

      if ($validationResult -eq $true) {
        Write-Success "Validacao customizada passou!"
        $script:passedTests++
        return @{ Success = $true; Data = $response }
      } else {
        Write-Error ("Validacao customizada falhou: {0}" -f $validationResult)
        $script:failedTests++
        return @{ Success = $false; Error = "Validacao falhou"; Data = $response }
      }
    }

    $script:passedTests++
    return @{ Success = $true; Data = $response }

  } catch {
    Write-Error ("FALHOU: {0}" -f $_.Exception.Message)
    $script:failedTests++
    return @{ Success = $false; Error = $_.Exception.Message }
  }
}

# ================================================================
# INICIO
# ================================================================
Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Magenta
Write-Host "VALIDACAO COMPLETA - SISTEMA CRON HISTORICO" -ForegroundColor Magenta
Write-Host ("=" * 60) -ForegroundColor Magenta
Write-Host ""
Write-Info ("API Base: {0}" -f $API_URL)
Write-Info ("Data    : {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Host ""

# ================================================================
# FASE 1: HEALTH
# ================================================================
Write-Section "FASE 1: Verificar Backend"

$healthCheck = Test-Endpoint `
  -Name "Health Check" `
  -Url "$API_URL/api/health" `
  -CustomValidation {
    param($response)
    if ($response.status -eq "ok") { return $true }
    return ("Status nao e 'ok': {0}" -f $response.status)
  }

if (-not $healthCheck.Success) {
  Write-Error "Backend nao esta acessivel!"
  Write-Warn  "Verifica se executaste: npm run dev"
  exit 1
}

# ================================================================
# FASE 2: LISTAR JOBS
# ================================================================
Write-Section "FASE 2: Listar Jobs Disponiveis"

$jobsList = Test-Endpoint `
  -Name "GET Jobs List" `
  -Url "$API_URL/api/cron/jobs" `
  -CustomValidation {
    param($response)

    if (-not $response.success) {
      return "API retornou success=false"
    }

    if (-not $response.data -or -not $response.data.jobs) {
      return "Resposta sem response.data.jobs"
    }

    if ($response.data.jobs.Count -le 0) {
      return "Nenhum job encontrado"
    }

    Write-Info ("Jobs encontrados: {0}" -f $response.data.jobs.Count)
    return $true
  }

if (-not $jobsList.Success) {
  Write-Error "Nao foi possivel obter lista de jobs!"
  exit 1
}

$jobs     = $jobsList.Data.data.jobs
$testJob  = $jobs[0]
$JOB_ID   = $testJob._id
$JOB_NAME = $testJob.name

Write-Info "Job selecionado para teste:"
Write-Host ("   ID   : {0}" -f $JOB_ID) -ForegroundColor White
Write-Host ("   Nome : {0}" -f $JOB_NAME) -ForegroundColor White
Write-Host ("   Tipo : {0}" -f $testJob.syncType) -ForegroundColor White

Write-Host ""
Write-Host "Jobs disponiveis (top 5):" -ForegroundColor Cyan

$jobs | Select-Object -First 5 | Format-Table `
  @{Label="Nome";       Expression={$_.name}; Width=30},
  @{Label="Tipo";       Expression={$_.syncType}; Width=10},
  @{Label="Ativo";      Expression={ if ($_.isActive) { "YES" } else { "NO" } }; Width=6},
  @{Label="TotalRuns";  Expression={$_.totalRuns}; Width=10},
  @{Label="SucessoPct"; Expression={
      if ($_.totalRuns -gt 0) { [math]::Round(($_.successfulRuns / $_.totalRuns) * 100, 1) } else { 0 }
    }; Width=10}

# ================================================================
# FASE 3: DETALHES DO JOB
# ================================================================
Write-Section "FASE 3: Verificar Estado do Job"

$jobDetails = Test-Endpoint `
  -Name "GET Job Details" `
  -Url "$API_URL/api/cron/jobs/$JOB_ID" `
  -CustomValidation {
    param($response)

    if (-not $response.success) {
      return "API retornou success=false"
    }

    if (-not $response.data -or $response.data._id -ne $JOB_ID) {
      return "Job nao encontrado ou ID diferente"
    }

    $job = $response.data

    $rate = 0
    if ($job.totalRuns -gt 0) { $rate = ($job.successfulRuns / $job.totalRuns) * 100 }

    Write-Host ""
    Write-Host "Detalhes do Job:" -ForegroundColor Cyan
    Write-Host ("   Nome         : {0}" -f $job.name) -ForegroundColor White
    Write-Host ("   Descricao    : {0}" -f $job.description) -ForegroundColor White
    Write-Host ("   Tipo Sync    : {0}" -f $job.syncType) -ForegroundColor White
    Write-Host ("   Ativo        : {0}" -f (if ($job.isActive) { "YES" } else { "NO" })) -ForegroundColor White
    Write-Host ("   Schedule     : {0}" -f $job.schedule.cronExpression) -ForegroundColor White
    Write-Host ("   Total Runs   : {0}" -f $job.totalRuns) -ForegroundColor White
    Write-Host ("   Sucesso      : {0}" -f $job.successfulRuns) -ForegroundColor Green
    Write-Host ("   Falhas       : {0}" -f $job.failedRuns) -ForegroundColor Red
    Write-Host ("   Taxa Sucesso : {0}%" -f ([math]::Round($rate, 1))) -ForegroundColor Yellow

    return $true
  }

# ================================================================
# FASE 4: TRIGGER MANUAL
# ================================================================
Write-Section "FASE 4: Executar Job Manualmente"

Write-Warn "Isto pode demorar 1-2 minutos dependendo do job..."
Write-Info ("Executando: {0}" -f $JOB_NAME)
Write-Host ""

$executionStart = Get-Date

$execution = Test-Endpoint `
  -Name "POST Trigger Job" `
  -Url "$API_URL/api/cron/jobs/$JOB_ID/trigger" `
  -Method "POST" `
  -CustomValidation {
    param($response)

    if (-not $response.success) {
      return ("Execucao falhou: {0}" -f $response.message)
    }

    if (-not $response.data) {
      return "Resposta sem response.data"
    }

    $duration = $response.data.duration
    $stats    = $response.data.stats

    Write-Success "Job executado com sucesso!"
    Write-Host ""
    Write-Host "Resultados da Execucao:" -ForegroundColor Cyan
    Write-Host ("   Duracao     : {0} segundos" -f $duration) -ForegroundColor White
    Write-Host ("   Total       : {0}" -f $stats.total) -ForegroundColor White
    Write-Host ("   Inseridos   : {0}" -f $stats.inserted) -ForegroundColor Green
    Write-Host ("   Atualizados : {0}" -f $stats.updated) -ForegroundColor Yellow
    Write-Host ("   Erros       : {0}" -f $stats.errors) -ForegroundColor Red
    Write-Host ("   Ignorados   : {0}" -f $stats.skipped) -ForegroundColor DarkGray

    return $true
  }

$executionEnd = Get-Date
$executionDuration = ($executionEnd - $executionStart).TotalSeconds
Write-Info ("Tempo total de execucao: {0} segundos" -f ([math]::Round($executionDuration, 2)))

if (-not $execution.Success) {
  Write-Warn "Execucao falhou, mas continuando com testes..."
}

Write-Info "Aguardando 5 segundos para garantir persistencia..."
Start-Sleep -Seconds 5

# ================================================================
# FASE 5: HISTORICO
# ================================================================
Write-Section "FASE 5: Verificar Historico via API"

$history = Test-Endpoint `
  -Name "GET Job History" `
  -Url "$API_URL/api/cron/jobs/$JOB_ID/history?limit=10" `
  -CustomValidation {
    param($response)

    if (-not $response.success) {
      return "API retornou success=false"
    }

    if (-not $response.data) {
      return "Resposta sem response.data"
    }

    $data = $response.data

    Write-Host ""
    Write-Host "Dados do Historico:" -ForegroundColor Cyan
    Write-Host ("   Job ID       : {0}" -f $data.jobId) -ForegroundColor White
    Write-Host ("   Job Name     : {0}" -f $data.jobName) -ForegroundColor White
    Write-Host ("   Total Runs   : {0}" -f $data.totalRuns) -ForegroundColor White
    Write-Host ("   Successful   : {0}" -f $data.successfulRuns) -ForegroundColor Green
    Write-Host ("   Failed       : {0}" -f $data.failedRuns) -ForegroundColor Red
    Write-Host ("   Success Rate : {0}%" -f ([math]::Round($data.successRate, 1))) -ForegroundColor Yellow

    $executions = $null
    if ($data.PSObject.Properties.Name -contains 'executions') {
      $executions = $data.executions
      Write-Info "Campo 'executions' encontrado (PATCH 2)"
    }
    elseif ($data.PSObject.Properties.Name -contains 'history') {
      $executions = $data.history
      Write-Warn "Campo 'history' encontrado (formato antigo)"
    }

    if ($executions -and $executions.Count -gt 0) {
      Write-Success "HISTORICO COMPLETO FUNCIONAL!"
      Write-Host ("   Execucoes encontradas: {0}" -f $executions.Count) -ForegroundColor Green

      Write-Host ""
      Write-Host "Ultimas Execucoes (top 5):" -ForegroundColor Cyan
      $executions | Select-Object -First 5 | ForEach-Object {
        $exec = $_
        $statusIcon  = if ($exec.status -eq "success") { "OK" } else { "FAIL" }
        $triggerIcon = if ($exec.triggeredBy -eq "MANUAL") { "MAN" } else { "SCH" }

        Write-Host ("   [{0}] [{1}] {2} | Duracao: {3}s | Total: {4}" -f `
          $statusIcon, $triggerIcon, $exec.startedAt, $exec.duration, $exec.stats.total)
      }

      return $true
    }
    else {
      Write-Warn "HISTORICO VAZIO!"
      Write-Info "Isto pode significar:"
      Write-Host "   1) PATCH 2 ainda nao aplicado (executions vazio)" -ForegroundColor Yellow
      Write-Host "   2) Job ainda nao terminou (aguarda mais tempo)" -ForegroundColor Yellow
      Write-Host "   3) Persistencia nao esta a funcionar (PATCH 1)" -ForegroundColor Yellow
      return "Historico vazio"
    }
  }

# ================================================================
# FASE 6: STATUS DO SCHEDULER
# ================================================================
Write-Section "FASE 6: Verificar Status do Scheduler"

$schedulerStatus = Test-Endpoint `
  -Name "GET Scheduler Status" `
  -Url "$API_URL/api/cron/status" `
  -CustomValidation {
    param($response)

    if (-not $response.success -or -not $response.data) {
      return "Status do scheduler nao disponivel"
    }

    $status = $response.data

    Write-Host ""
    Write-Host "Estado do Scheduler:" -ForegroundColor Cyan
    Write-Host ("   Running    : {0}" -f (if ($status.schedulerRunning) { "YES" } else { "NO" })) -ForegroundColor White
    Write-Host ("   Total Jobs : {0}" -f $status.stats.totalActiveJobs) -ForegroundColor White
    Write-Host ("   Enabled    : {0}" -f $status.stats.enabledJobs) -ForegroundColor Green
    Write-Host ("   Disabled   : {0}" -f $status.stats.disabledJobs) -ForegroundColor Red

    Write-Host ""
    Write-Host "   Por Tipo:" -ForegroundColor Cyan
    Write-Host ("      Hotmart   : {0}" -f $status.stats.byType.hotmart) -ForegroundColor White
    Write-Host ("      CursEduca : {0}" -f $status.stats.byType.curseduca) -ForegroundColor White
    Write-Host ("      Discord   : {0}" -f $status.stats.byType.discord) -ForegroundColor White
    Write-Host ("      All       : {0}" -f $status.stats.byType.all) -ForegroundColor White

    return $true
  }

# ================================================================
# FASE 7: MONGODB (MANUAL)
# ================================================================
Write-Section "FASE 7: Verificacao MongoDB (Manual)"

Write-Host ""
Write-Info "Comandos MongoDB para verificar persistencia:"
Write-Host ""
Write-Host "mongo" -ForegroundColor Yellow
Write-Host "use bo2_api" -ForegroundColor Yellow
Write-Host ""
Write-Host "# Ver collections:" -ForegroundColor Cyan
Write-Host "show collections" -ForegroundColor Yellow
Write-Host "# Deve aparecer: cronexecutions" -ForegroundColor DarkGray
Write-Host ""
Write-Host "# Contar registos:" -ForegroundColor Cyan
Write-Host "db.cronexecutions.countDocuments()" -ForegroundColor Yellow
Write-Host "# Deve ser > 0" -ForegroundColor DarkGray
Write-Host ""
Write-Host "# Ultima execucao:" -ForegroundColor Cyan
Write-Host "db.cronexecutions.find().sort({startTime: -1}).limit(1).pretty()" -ForegroundColor Yellow
Write-Host ""
Write-Host "# Execucoes do job testado:" -ForegroundColor Cyan
Write-Host ("db.cronexecutions.find({cronName: '{0}'}).sort({startTime: -1}).limit(3).pretty()" -f $JOB_NAME) -ForegroundColor Yellow
Write-Host ""

# ================================================================
# FASE 8: CLEANUP (LOGS)
# ================================================================
Write-Section "FASE 8: Verificar Cleanup Job (Logs)"

Write-Host ""
Write-Info "Verifica nos logs do backend se aparece:"
Write-Host ""
Write-Host "   CRON Job de limpeza configurado" -ForegroundColor Green
Write-Host "   Schedule: 0 3 * * 0 (Domingos 03:00)" -ForegroundColor DarkGray
Write-Host "   Retencao: 90 dias | Minimo: 100 registos" -ForegroundColor DarkGray
Write-Host ""
Write-Warn "Se nao apareceu, verifica:"
Write-Host "   1) cronExecutionCleanup.job.ts em src/jobs/" -ForegroundColor Yellow
Write-Host "   2) import no index.ts: import './jobs/cronExecutionCleanup.job'" -ForegroundColor Yellow
Write-Host "   3) nao chamar cleanup manual no arranque" -ForegroundColor Yellow
Write-Host ""

# ================================================================
# RELATORIO FINAL
# ================================================================
Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Magenta
Write-Host "RELATORIO FINAL" -ForegroundColor Magenta
Write-Host ("=" * 60) -ForegroundColor Magenta
Write-Host ""

Write-Host "Estatisticas dos Testes:" -ForegroundColor Cyan
Write-Host ("   Total  : {0}" -f $totalTests) -ForegroundColor White
Write-Host ("   Passou : {0}" -f $passedTests) -ForegroundColor Green
Write-Host ("   Falhou : {0}" -f $failedTests) -ForegroundColor Red

$rateAll = 0
if ($totalTests -gt 0) { $rateAll = ($passedTests / $totalTests) * 100 }
Write-Host ("   Taxa   : {0}%" -f ([math]::Round($rateAll, 1))) -ForegroundColor Yellow
Write-Host ""

Write-Host "Diagnostico do Sistema:" -ForegroundColor Cyan
Write-Host ""

if ($execution.Success) {
  Write-Success "PATCH 1 (Persistencia): Job executou com sucesso"
  Write-Info "Proximo passo: Verificar MongoDB se tem registos"
} else {
  Write-Error "PATCH 1 (Persistencia): Job falhou ao executar"
  Write-Warn  "Verifica: cronManagement.service.ts foi atualizado? Reinicia o backend."
}

Write-Host ""

if ($history.Success) {
  Write-Success "PATCH 2 (Historico API): Historico retorna execucoes"
  Write-Info "Sistema funcional do lado da API"
} else {
  Write-Warn "PATCH 2 (Historico API): Historico vazio ou incompleto"
  Write-Info "Possiveis causas:"
  Write-Host "   1) PATCH 2 ainda nao aplicado no controller" -ForegroundColor Yellow
  Write-Host "   2) Job ainda nao terminou (aguarda mais tempo)" -ForegroundColor Yellow
  Write-Host "   3) MongoDB sem registos (verifica PATCH 1)" -ForegroundColor Yellow
}

Write-Host ""
Write-Info "PATCH 3 (Cleanup): Verificar logs do backend manualmente"
Write-Host ""

Write-Host ("=" * 60) -ForegroundColor Blue
Write-Host "PROXIMOS PASSOS" -ForegroundColor Blue
Write-Host ("=" * 60) -ForegroundColor Blue
Write-Host ""

if ($passedTests -eq $totalTests) {
  Write-Success "TODOS OS TESTES PASSARAM"
  Write-Info "Ainda assim valida:"
  Write-Host "   1) MongoDB (comandos acima)" -ForegroundColor Yellow
  Write-Host "   2) Logs do backend (cleanup job)" -ForegroundColor Yellow
  Write-Host "   3) Frontend (modal de historico)" -ForegroundColor Yellow
} else {
  Write-Warn "Alguns testes falharam"
  Write-Info "Acoes recomendadas:"
  if (-not $execution.Success) {
    Write-Host "   1) Verificar cronManagement.service.ts e reiniciar backend" -ForegroundColor Yellow
    Write-Host "   2) Verificar logs durante trigger" -ForegroundColor Yellow
  }
  if (-not $history.Success) {
    Write-Host "   3) Aplicar PATCH 2 no cronManagement.controller.ts" -ForegroundColor Yellow
    Write-Host "   4) Reiniciar backend e correr script de novo" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Magenta
Write-Host "TESTE CONCLUIDO" -ForegroundColor Magenta
Write-Host ("=" * 60) -ForegroundColor Magenta
Write-Host ""

# ---------- Guardar relatorio ----------
$reportFile = "relatorio-cron-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"

$execTxt    = if ($execution.Success) { "OK" } else { "FAIL" }
$historyTxt = if ($history.Success)   { "OK" } else { "EMPTY" }

$report = @"
============================================================
RELATORIO DE VALIDACAO - SISTEMA CRON HISTORICO
============================================================
Data: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
API : $API_URL

ESTATISTICAS:
- Total de testes  : $totalTests
- Testes passados  : $passedTests
- Testes falhados  : $failedTests
- Taxa de sucesso  : $([math]::Round($rateAll, 1))%

JOB TESTADO:
- ID       : $JOB_ID
- Nome     : $JOB_NAME
- Execucao : $execTxt
- Historico: $historyTxt

============================================================
"@

$report | Out-File -FilePath $reportFile -Encoding UTF8
Write-Info ("Relatorio salvo em: {0}" -f $reportFile)
