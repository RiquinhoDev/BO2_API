# ════════════════════════════════════════════════════════════
# 🧪 SCRIPT DE TESTE - DASHBOARD V2 ENDPOINTS
# ════════════════════════════════════════════════════════════

param(
    [string]$BaseUrl = "http://localhost:3001"
)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  TESTANDO DASHBOARD V2 ENDPOINTS" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

$ErrorCount = 0
$SuccessCount = 0

# ════════════════════════════════════════════════════════════
# TESTE 1: GET /api/dashboard/products
# ════════════════════════════════════════════════════════════

Write-Host "1. Testando GET /api/dashboard/products..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/products" -Method Get
    
    if ($response.success -eq $true) {
        Write-Host "   OK Endpoint responde" -ForegroundColor Green
        Write-Host "   OK Produtos encontrados: $($response.data.Count)" -ForegroundColor Green
        
        if ($response.data.Count -gt 0) {
            $product = $response.data[0]
            Write-Host "   OK Produto exemplo: $($product.productName) ($($product.productCode))" -ForegroundColor Green
            Write-Host "      Total Alunos: $($product.totalStudents)" -ForegroundColor White
            Write-Host "      Alunos Ativos: $($product.activeStudents)" -ForegroundColor White
            Write-Host "      Avg Engagement: $($product.avgEngagement)" -ForegroundColor White
        }
        
        $SuccessCount++
    } else {
        Write-Host "   ERRO Response.success = false" -ForegroundColor Red
        $ErrorCount++
    }
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
    $ErrorCount++
}

Write-Host ""

# ════════════════════════════════════════════════════════════
# TESTE 2: GET /api/dashboard/products?platforms=hotmart
# ════════════════════════════════════════════════════════════

Write-Host "2. Testando GET /api/dashboard/products?platforms=hotmart..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/products?platforms=hotmart" -Method Get
    
    if ($response.success -eq $true) {
        Write-Host "   OK Endpoint com filtro responde" -ForegroundColor Green
        Write-Host "   OK Produtos Hotmart encontrados: $($response.data.Count)" -ForegroundColor Green
        
        # Verificar se todos são Hotmart
        $allHotmart = $true
        foreach ($product in $response.data) {
            if ($product.platform -ne "hotmart") {
                $allHotmart = $false
                break
            }
        }
        
        if ($allHotmart) {
            Write-Host "   OK Filtro de plataforma funciona corretamente" -ForegroundColor Green
        } else {
            Write-Host "   ERRO Filtro retornou outras plataformas" -ForegroundColor Red
            $ErrorCount++
        }
        
        $SuccessCount++
    } else {
        Write-Host "   ERRO Response.success = false" -ForegroundColor Red
        $ErrorCount++
    }
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
    $ErrorCount++
}

Write-Host ""

# ════════════════════════════════════════════════════════════
# TESTE 3: GET /api/dashboard/engagement
# ════════════════════════════════════════════════════════════

Write-Host "3. Testando GET /api/dashboard/engagement..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/engagement" -Method Get
    
    if ($response.success -eq $true) {
        Write-Host "   OK Endpoint responde" -ForegroundColor Green
        
        $data = $response.data
        Write-Host "   OK Total analisados: $($data.total)" -ForegroundColor Green
        Write-Host "      Excelente: $($data.excellent) ($($data.excellentPercentage)%)" -ForegroundColor White
        Write-Host "      Bom: $($data.good) ($($data.goodPercentage)%)" -ForegroundColor White
        Write-Host "      Moderado: $($data.moderate) ($($data.moderatePercentage)%)" -ForegroundColor White
        Write-Host "      Em Risco: $($data.atRisk) ($($data.atRiskPercentage)%)" -ForegroundColor White
        
        # Verificar se soma bate
        $sum = $data.excellent + $data.good + $data.moderate + $data.atRisk
        if ($sum -eq $data.total) {
            Write-Host "   OK Soma das faixas = total" -ForegroundColor Green
        } else {
            Write-Host "   ERRO Soma das faixas ($sum) != total ($($data.total))" -ForegroundColor Red
            $ErrorCount++
        }
        
        $SuccessCount++
    } else {
        Write-Host "   ERRO Response.success = false" -ForegroundColor Red
        $ErrorCount++
    }
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
    $ErrorCount++
}

Write-Host ""

# ════════════════════════════════════════════════════════════
# TESTE 4: GET /api/dashboard/compare (Validação de Erro)
# ════════════════════════════════════════════════════════════

Write-Host "4. Testando GET /api/dashboard/compare (sem params - deve falhar)..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/compare" -Method Get -ErrorAction Stop
    
    if ($response.success -eq $false) {
        Write-Host "   OK Validacao de erro funciona" -ForegroundColor Green
        Write-Host "   OK Mensagem: $($response.message)" -ForegroundColor Green
        $SuccessCount++
    } else {
        Write-Host "   ERRO Deveria ter falhado mas retornou success=true" -ForegroundColor Red
        $ErrorCount++
    }
} catch {
    # Espera-se erro 400
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "   OK Status 400 retornado corretamente" -ForegroundColor Green
        $SuccessCount++
    } else {
        Write-Host "   ERRO Status esperado: 400, recebido: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        $ErrorCount++
    }
}

Write-Host ""

# ════════════════════════════════════════════════════════════
# TESTE 5: GET /api/dashboard/compare (com 2 produtos)
# ════════════════════════════════════════════════════════════

Write-Host "5. Testando GET /api/dashboard/compare (buscar IDs primeiro)..." -ForegroundColor Yellow

try {
    # Primeiro, buscar lista de produtos para obter 2 IDs
    $productsResponse = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/products" -Method Get
    
    if ($productsResponse.data.Count -ge 2) {
        $productId1 = $productsResponse.data[0].productId
        $productId2 = $productsResponse.data[1].productId
        
        Write-Host "   OK IDs obtidos:" -ForegroundColor Green
        Write-Host "      Produto 1: $($productsResponse.data[0].productName) ($productId1)" -ForegroundColor White
        Write-Host "      Produto 2: $($productsResponse.data[1].productName) ($productId2)" -ForegroundColor White
        
        # Agora comparar
        $compareResponse = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard/compare?productId1=$productId1&productId2=$productId2" -Method Get
        
        if ($compareResponse.success -eq $true) {
            Write-Host "   OK Comparacao funciona" -ForegroundColor Green
            
            $p1 = $compareResponse.data.product1
            $p2 = $compareResponse.data.product2
            $diff = $compareResponse.data.differences
            
            Write-Host "      Diferenca Total Alunos: $($diff.totalStudents)" -ForegroundColor White
            Write-Host "      Diferenca Engagement: $($diff.avgEngagement)" -ForegroundColor White
            Write-Host "      Diferenca Progresso: $($diff.avgProgress)" -ForegroundColor White
            
            $SuccessCount++
        } else {
            Write-Host "   ERRO Response.success = false" -ForegroundColor Red
            $ErrorCount++
        }
    } else {
        Write-Host "   SKIP Menos de 2 produtos para comparar" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
    $ErrorCount++
}

Write-Host ""

# ════════════════════════════════════════════════════════════
# RESUMO
# ════════════════════════════════════════════════════════════

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESUMO DOS TESTES" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "  Sucessos: $SuccessCount" -ForegroundColor Green
Write-Host "  Erros: $ErrorCount" -ForegroundColor $(if ($ErrorCount -eq 0) { "Green" } else { "Red" })

Write-Host ""

if ($ErrorCount -eq 0) {
    Write-Host "  TODOS OS TESTES PASSARAM!" -ForegroundColor Green -BackgroundColor Black
    Write-Host "  Dashboard V2 esta 100% funcional!" -ForegroundColor Green -BackgroundColor Black
} else {
    Write-Host "  ALGUNS TESTES FALHARAM" -ForegroundColor Red -BackgroundColor Black
    Write-Host "  Verificar logs acima para detalhes" -ForegroundColor Yellow
}

Write-Host "`n========================================`n" -ForegroundColor Cyan

# Return exit code based on errors
exit $ErrorCount

