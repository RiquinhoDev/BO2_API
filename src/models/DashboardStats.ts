// ═══════════════════════════════════════════════════════════════════════════
// 📊 MODEL: DashboardStats (Materialized View)
// ═══════════════════════════════════════════════════════════════════════════
// Guarda stats pré-calculados para carregamento instantâneo do dashboard
// Atualizado por CRON job e após syncs
// ═══════════════════════════════════════════════════════════════════════════

import mongoose, { Schema, Document } from 'mongoose';

export interface IDashboardStats extends Document {
  version: string; // "v3"
  calculatedAt: Date;
  
  overview: {
    totalStudents: number;
    avgEngagement: number;
    avgProgress: number;
    activeCount: number;
    activeRate: number;
    atRiskCount: number;
    atRiskRate: number;
    activeProducts: number;
    healthScore: number;
    healthLevel: string;
    healthBreakdown: {
      engagement: number;
      retention: number;
      growth: number;
      progress: number;
    };
  };
  
  byPlatform: Array<{
    platform: string;
    totalStudents: number;
    percentage: number;
  }>;
  
  quickFilters: {
    newStudents: number;
    new7d: number;
    atRisk: number;
    topPerformers: number;
    inactive30d: number;
  };
  
  platformDistribution: {
    [key: string]: {
      count: number;
      percentage: number;
    };
  };
  
  meta: {
    calculationDuration: number; // ms
    nextUpdate: Date;
    dataFreshness: string; // "FRESH", "STALE", "VERY_STALE"
    totalUserProducts: number;
    uniqueUsers: number;
  };
}

const DashboardStatsSchema = new Schema<IDashboardStats>({
  version: { type: String, required: true, default: 'v3' },
  calculatedAt: { type: Date, required: true, default: Date.now },
  
  overview: {
    totalStudents: { type: Number, required: true },
    avgEngagement: { type: Number, required: true },
    avgProgress: { type: Number, required: true },
    activeCount: { type: Number, required: true },
    activeRate: { type: Number, required: true },
    atRiskCount: { type: Number, required: true },
    atRiskRate: { type: Number, required: true },
    activeProducts: { type: Number, required: true },
    healthScore: { type: Number, required: true },
    healthLevel: { type: String, required: true },
    healthBreakdown: {
      engagement: { type: Number, required: true },
      retention: { type: Number, required: true },
      growth: { type: Number, required: true },
      progress: { type: Number, required: true }
    }
  },
  
  byPlatform: [{
    platform: { type: String, required: true },
    totalStudents: { type: Number, required: true },
    percentage: { type: Number, required: true }
  }],
  
  quickFilters: {
    newStudents: { type: Number, required: true },
    new7d: { type: Number, required: true },
    atRisk: { type: Number, required: true },
    topPerformers: { type: Number, required: true },
    inactive30d: { type: Number, required: true }
  },
  
  platformDistribution: { type: Schema.Types.Mixed, required: true },
  
  meta: {
    calculationDuration: { type: Number, required: true },
    nextUpdate: { type: Date, required: true },
    dataFreshness: { type: String, required: true },
    totalUserProducts: { type: Number, required: true },
    uniqueUsers: { type: Number, required: true }
  }
}, {
  timestamps: true,
  collection: 'dashboardstats'
});

// Índice único por version (só 1 documento "v3")
DashboardStatsSchema.index({ version: 1 }, { unique: true });

export const DashboardStats = mongoose.model<IDashboardStats>('DashboardStats', DashboardStatsSchema);

