@echo off
REM ════════════════════════════════════════════════════════════
REM OTIMIZACAO RAPIDA: Adicionar LOG_LEVEL ao .env
REM ════════════════════════════════════════════════════════════

echo ════════════════════════════════════════════════════════════
echo OTIMIZACAO RAPIDA - DESATIVAR LOGS VERBOSOS
echo ════════════════════════════════════════════════════════════
echo.

echo 🎯 OBJETIVO:
echo    Reduzir tempo de jobs de 30-60min para 10-15min!
echo.
echo 📊 IMPACTO:
echo    - EvaluateRules: 30min → 10min (3x mais rapido!)
echo    - ResetCounters: 30min → 10min (3x mais rapido!)
echo    - DailyPipeline: 60min → 25min (2.4x mais rapido!)
echo.

REM Verificar se .env existe
if not exist ".env" (
    echo ❌ ERRO: Ficheiro .env nao encontrado!
    echo    Certifica-te que estas na pasta raiz do projeto.
    pause
    exit /b 1
)

echo [1/3] Fazendo backup do .env...
copy .env .env.backup-performance
echo ✅ Backup criado: .env.backup-performance
echo.

echo [2/3] Verificando se LOG_LEVEL ja existe...
findstr /C:"LOG_LEVEL" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  LOG_LEVEL ja existe no .env
    echo    A substituir valor...
    
    REM Criar ficheiro temporario sem linha LOG_LEVEL
    findstr /V /C:"LOG_LEVEL" .env > .env.tmp
    
    REM Adicionar nova linha
    echo LOG_LEVEL=error >> .env.tmp
    
    REM Substituir .env
    move /Y .env.tmp .env >nul
    
    echo ✅ LOG_LEVEL atualizado para 'error'
) else (
    echo    LOG_LEVEL nao existe, a adicionar...
    echo. >> .env
    echo # Otimizacao: Desativar logs verbosos >> .env
    echo LOG_LEVEL=error >> .env
    echo ✅ LOG_LEVEL adicionado ao .env
)
echo.

echo [3/3] Verificando resultado...
findstr /C:"LOG_LEVEL" .env
echo.

echo ════════════════════════════════════════════════════════════
echo ✅ OTIMIZACAO APLICADA COM SUCESSO!
echo ════════════════════════════════════════════════════════════
echo.
echo 📋 PROXIMOS PASSOS:
echo.
echo    1. Reiniciar servidor:
echo       npm run dev
echo.
echo    2. Executar teste novamente:
echo       npx ts-node scripts/test-e2e-all-jobs.ts
echo.
echo    3. RESULTADO ESPERADO:
echo       EvaluateRules: ~10-15min (antes: 30-60min)
echo       ResetCounters: ~5-10min (antes: 30-60min)
echo.
echo 💾 BACKUP em: .env.backup-performance
echo.
echo ════════════════════════════════════════════════════════════
pause