import type { InsightRow } from '../types/meta'
import { extractRoas, getPrimaryResult } from '../types/meta'
import type { AuditRecommendation, HealthStatus, HealthSummary } from '../types/audit'
import { AUDIT_THRESHOLDS as T } from '../types/audit'

type EntityLevel = 'campaign' | 'adset' | 'ad'

function getName(row: InsightRow, level: EntityLevel): string {
  if (level === 'campaign') return row.campaign_name || 'Sin nombre'
  if (level === 'adset') return row.adset_name || 'Sin nombre'
  return row.ad_name || 'Sin nombre'
}

function getId(row: InsightRow, level: EntityLevel): string {
  if (level === 'campaign') return row.campaign_id || ''
  if (level === 'adset') return row.adset_id || ''
  return row.ad_id || ''
}

/**
 * Evaluate the health status of a single row
 */
export function getRowHealth(row: InsightRow): HealthStatus {
  const spend = parseFloat(row.spend) || 0
  const roas = extractRoas(row)
  const result = getPrimaryResult(row)
  const ctr = parseFloat(row.ctr) || 0
  const frequency = parseFloat(row.frequency) || 0

  // Critical: losing money or spending with zero return
  if (roas > 0 && roas < T.ROAS_CRITICAL) return 'critical'
  if (spend > T.SPEND_NO_CONVERSION_CRITICAL && result.value === 0) return 'critical'
  if (frequency > T.FREQUENCY_CRITICAL) return 'critical'

  // Warning
  if (roas > 0 && roas < T.ROAS_WARNING) return 'warning'
  if (spend > T.SPEND_NO_CONVERSION_WARNING && result.value === 0) return 'warning'
  if (ctr > 0 && ctr < T.CTR_CRITICAL) return 'warning'
  if (frequency > T.FREQUENCY_WARNING) return 'warning'

  // Excellent
  if (roas >= T.ROAS_EXCELLENT) return 'excellent'
  if (ctr >= T.CTR_EXCELLENT && roas >= T.ROAS_GOOD) return 'excellent'

  // Good
  if (roas >= T.ROAS_GOOD) return 'good'
  if (ctr >= T.CTR_GOOD && result.value > 0) return 'good'

  return 'good'
}

/**
 * Generate a health summary from a list of rows
 */
export function getHealthSummary(rows: InsightRow[]): HealthSummary {
  const summary: HealthSummary = { excellent: 0, good: 0, warning: 0, critical: 0, total: rows.length }
  for (const row of rows) {
    const status = getRowHealth(row)
    summary[status]++
  }
  return summary
}

/**
 * Main audit engine — analyzes rows and returns prioritized recommendations
 */
export function auditRows(rows: InsightRow[], level: EntityLevel): AuditRecommendation[] {
  const recs: AuditRecommendation[] = []
  if (!rows.length) return recs

  const totalSpend = rows.reduce((sum, r) => sum + (parseFloat(r.spend) || 0), 0)
  const avgCpc = rows.reduce((sum, r) => sum + (parseFloat(r.cpc) || 0), 0) / rows.length
  const avgCpm = rows.reduce((sum, r) => sum + (parseFloat(r.cpm) || 0), 0) / rows.length

  for (const row of rows) {
    const name = getName(row, level)
    const spend = parseFloat(row.spend) || 0
    const roas = extractRoas(row)
    const result = getPrimaryResult(row)
    const ctr = parseFloat(row.ctr) || 0
    const cpc = parseFloat(row.cpc) || 0
    const cpm = parseFloat(row.cpm) || 0
    const frequency = parseFloat(row.frequency) || 0
    const id = getId(row, level)

    // Rule 1: ROAS < 1 with significant spend — losing money
    if (roas > 0 && roas < T.ROAS_CRITICAL && spend > 200) {
      recs.push({
        id: `roas-critical-${id}`,
        severity: 'critical',
        entityId: id,
        entityName: name,
        entityLevel: level,
        title: 'ROAS por debajo de punto de equilibrio',
        description: `ROAS de ${roas.toFixed(2)}x con $${spend.toFixed(0)} gastados. Está perdiendo dinero en cada peso invertido.`,
        action: 'Pausa esta campaña y redirige el presupuesto a las que sí convierten.',
        metric: 'ROAS',
        metricValue: roas,
      })
    }

    // Rule 2: Spend without results (based on campaign objective)
    if (result.value === 0 && spend > T.SPEND_NO_CONVERSION_WARNING) {
      const sev = spend > T.SPEND_NO_CONVERSION_CRITICAL ? 'critical' : 'warning'
      recs.push({
        id: `no-conv-${id}`,
        severity: sev,
        entityId: id,
        entityName: name,
        entityLevel: level,
        title: `Gasto sin resultados`,
        description: `$${spend.toFixed(0)} gastados sin ningún resultado (${result.label.toLowerCase()}) registrado.`,
        action: result.objective === 'messages'
          ? 'Revisa que el CTA apunte al canal de mensajes correcto y que la audiencia esté bien segmentada.'
          : result.objective === 'leads'
          ? 'Revisa el formulario de leads y la segmentación de audiencia.'
          : 'Verifica que el pixel esté disparando correctamente y revisa la página de destino.',
        metric: result.label,
        metricValue: 0,
      })
    }

    // Rule 3: CTR very low
    if (ctr > 0 && ctr < T.CTR_CRITICAL && spend > 100) {
      recs.push({
        id: `ctr-low-${id}`,
        severity: 'warning',
        entityId: id,
        entityName: name,
        entityLevel: level,
        title: 'CTR muy bajo',
        description: `CTR de ${ctr.toFixed(2)}%, muy por debajo del promedio del mercado (1-1.5%).`,
        action: 'El copy o la creatividad no resuena con la audiencia. Prueba nuevas variantes de anuncio.',
        metric: 'CTR',
        metricValue: ctr,
      })
    }

    // Rule 4: High frequency — audience fatigue
    if (frequency > T.FREQUENCY_WARNING) {
      const sev = frequency > T.FREQUENCY_CRITICAL ? 'critical' : 'warning'
      recs.push({
        id: `freq-${id}`,
        severity: sev,
        entityId: id,
        entityName: name,
        entityLevel: level,
        title: 'Fatiga de audiencia',
        description: `Frecuencia de ${frequency.toFixed(1)}. Tu audiencia ve el anuncio demasiadas veces.`,
        action: 'Rota creativos, amplía la audiencia, o implementa exclusions de audiencia.',
        metric: 'Frecuencia',
        metricValue: frequency,
      })
    }

    // Rule 5: CPC much higher than account average
    if (avgCpc > 0 && cpc > avgCpc * T.CPC_HIGH_MULTIPLIER && spend > 100) {
      recs.push({
        id: `cpc-high-${id}`,
        severity: 'warning',
        entityId: id,
        entityName: name,
        entityLevel: level,
        title: 'CPC muy alto',
        description: `CPC de $${cpc.toFixed(2)}, mientras el promedio de la cuenta es $${avgCpc.toFixed(2)} (${(cpc / avgCpc).toFixed(1)}x más caro).`,
        action: 'Revisa la segmentación. Audiencias muy pequeñas o competidas elevan el CPC.',
        metric: 'CPC',
        metricValue: cpc,
      })
    }

    // Rule 6: CPM very high
    if (cpm > T.CPM_VERY_HIGH) {
      recs.push({
        id: `cpm-high-${id}`,
        severity: 'warning',
        entityId: id,
        entityName: name,
        entityLevel: level,
        title: 'CPM elevado',
        description: `CPM de $${cpm.toFixed(0)}, significativamente arriba del promedio del mercado ($40-$70 MXN).`,
        action: 'Prueba audiencias más amplias o cambia el objetivo de campaña para reducir costos de delivery.',
        metric: 'CPM',
        metricValue: cpm,
      })
    }

    // Rule 7: Quality ranking below average (ads only)
    if (level === 'ad' && row.quality_ranking) {
      const qr = row.quality_ranking.toLowerCase()
      if (qr.includes('below')) {
        recs.push({
          id: `quality-${id}`,
          severity: 'warning',
          entityId: id,
          entityName: name,
          entityLevel: level,
          title: 'Calidad de anuncio baja',
          description: `Meta clasifica este anuncio con calidad "${row.quality_ranking.replace(/_/g, ' ')}".`,
          action: 'Meta penaliza tu delivery y aumenta costos. Mejora la relevancia del contenido para tu audiencia.',
          metric: 'Quality',
          metricValue: 0,
        })
      }
    }

    // Rule 8: High CTR but low ROAS — landing page problem
    if (ctr >= T.CTR_GOOD && roas > 0 && roas < T.ROAS_WARNING && spend > 200) {
      recs.push({
        id: `ctr-roas-mismatch-${id}`,
        severity: 'warning',
        entityId: id,
        entityName: name,
        entityLevel: level,
        title: 'Buen CTR pero bajo ROAS',
        description: `CTR de ${ctr.toFixed(2)}% (bueno) pero ROAS de ${roas.toFixed(2)}x (bajo). La gente clickea pero no convierte.`,
        action: 'El problema probablemente está en la landing page, el precio, o la experiencia post-click.',
        metric: 'ROAS',
        metricValue: roas,
      })
    }

    // Rule 9: ROAS excellent with low spend — scale opportunity
    if (roas >= T.ROAS_EXCELLENT && spend < totalSpend * 0.15 && spend > T.SCALE_MIN_SPEND) {
      recs.push({
        id: `scale-${id}`,
        severity: 'opportunity',
        entityId: id,
        entityName: name,
        entityLevel: level,
        title: '¡Oportunidad de escalar!',
        description: `ROAS de ${roas.toFixed(2)}x con solo $${spend.toFixed(0)} de gasto (${((spend / totalSpend) * 100).toFixed(0)}% del total).`,
        action: 'Este elemento tiene excelente rendimiento. Incrementa presupuesto gradualmente (20-30% cada 3-4 días).',
        metric: 'ROAS',
        metricValue: roas,
      })
    }

    // Rule 10: Budget concentration (only meaningful with multiple elements)
    if (rows.length > 1 && totalSpend > 0 && spend / totalSpend > T.BUDGET_CONCENTRATION_WARNING) {
      const pct = (spend / totalSpend) * 100
      const sev = spend / totalSpend > T.BUDGET_CONCENTRATION_CRITICAL ? 'warning' : 'info'
      recs.push({
        id: `concentration-${id}`,
        severity: sev,
        entityId: id,
        entityName: name,
        entityLevel: level,
        title: 'Concentración de presupuesto',
        description: `Concentra el ${pct.toFixed(0)}% del gasto total de la cuenta.`,
        action: 'Diversifica el presupuesto entre más elementos para reducir riesgo y descubrir oportunidades.',
        metric: 'Gasto',
        metricValue: spend,
      })
    }
  }

  // Sort by severity: critical > warning > opportunity > info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 }
  recs.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return recs
}

/**
 * Audit a single entity — used in DetailPanel
 */
export function auditSingleEntity(row: InsightRow, level: EntityLevel): AuditRecommendation[] {
  return auditRows([row], level)
}
