// =====================================================
// 📁 tests/load/load.test.ts
// Testes de carga para verificar performance
// =====================================================

import axios from 'axios'

const BASE_URL = process.env.TEST_URL || 'http://localhost:3001'
const CONCURRENT_REQUESTS = 100
const TOTAL_REQUESTS = 1000

describe('Load Tests', () => {
  it('deve aguentar 100 requests concorrentes', async () => {
    const promises = []
    const startTime = Date.now()

    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
      promises.push(
        axios.get(`${BASE_URL}/api/health`).catch(err => ({
          error: err.message,
        }))
      )
    }

    const results = await Promise.all(promises)
    const endTime = Date.now()
    const duration = endTime - startTime

    // Análise dos resultados
    const successCount = results.filter((r: any) => !r.error).length
    const errorCount = results.filter((r: any) => r.error).length

    console.log(`✅ Concluído em ${duration}ms`)
    console.log(`✅ Sucessos: ${successCount}`)
    console.log(`❌ Erros: ${errorCount}`)

    // Assertions
    expect(successCount).toBeGreaterThan(CONCURRENT_REQUESTS * 0.95) // 95% success rate
    expect(duration).toBeLessThan(10000) // < 10 segundos
  })

  it('deve manter performance com 1000 requests sequenciais', async () => {
    const startTime = Date.now()
    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < TOTAL_REQUESTS; i++) {
      try {
        await axios.get(`${BASE_URL}/api/health`)
        successCount++
      } catch (error) {
        errorCount++
      }
    }

    const endTime = Date.now()
    const duration = endTime - startTime
    const avgTime = duration / TOTAL_REQUESTS

    console.log(`✅ Total: ${TOTAL_REQUESTS} requests`)
    console.log(`✅ Sucessos: ${successCount}`)
    console.log(`❌ Erros: ${errorCount}`)
    console.log(`⚡ Tempo médio: ${avgTime.toFixed(2)}ms`)

    // Assertions
    expect(successCount).toBeGreaterThan(TOTAL_REQUESTS * 0.95)
    expect(avgTime).toBeLessThan(100) // < 100ms average
  }, 120000) // 2 minutos timeout
})

