import { Request, Response } from 'express'
import GuruMonthlySnapshot from '../../models/GuruMonthlySnapshot'
import { errorMessage } from './support'

export const getChurnFromSnapshots = async (req: Request, res: Response) => {
  try {
    // Buscar todos os snapshots ordenados
    const snapshots = await GuruMonthlySnapshot.find()
      .sort({ year: 1, month: 1 })
      .lean()

    if (snapshots.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhum snapshot encontrado. Crie snapshots primeiro.',
        snapshots: 0
      })
    }

    // Usar o churn jÃ¡ calculado em cada snapshot (dados corretos!)
    const monthlyChurn = snapshots.map((snapshot) => ({
      year: snapshot.year,
      month: snapshot.month,
      monthName: new Date(snapshot.year, snapshot.month - 1).toLocaleDateString('pt-PT', {
        month: 'short',
        year: 'numeric'
      }),
      baseAtStart: snapshot.churn.baseAtStart,
      lostSubscriptions: snapshot.churn.lostSubscriptions,
      churnRate: snapshot.churn.rate,
      retentionRate: snapshot.churn.retention,
      // Dados adicionais Ãºteis
      activeAtEnd: snapshot.totals.active,
      newSubscriptions: snapshot.movements?.newSubscriptions || 0
    }))

    // Calcular churn mÃ©dio (excluir meses com base 0 para nÃ£o distorcer)
    const validMonths = monthlyChurn.filter(m => m.baseAtStart > 0)
    const avgChurnRate = validMonths.length > 0
      ? validMonths.reduce((sum, m) => sum + m.churnRate, 0) / validMonths.length
      : 0

    return res.json({
      success: true,
      churn: {
        average: parseFloat(avgChurnRate.toFixed(2)),
        months: monthlyChurn,
        totalSnapshots: snapshots.length,
        period: `${snapshots[0].month}/${snapshots[0].year} - ${snapshots[snapshots.length-1].month}/${snapshots[snapshots.length-1].year}`
      }
    })

  } catch (error: unknown) {
    const message = errorMessage(error)
    console.error('âŒ [SNAPSHOT] Erro ao calcular churn:', message)
    return res.status(500).json({
      success: false,
      message
    })
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CREATE HISTORICAL SNAPSHOTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Criar snapshots histÃ³ricos retroativos
 * POST /guru/snapshots/historical
 * Body: { startYear?: number, startMonth?: number, endYear?: number, endMonth?: number }
 */
