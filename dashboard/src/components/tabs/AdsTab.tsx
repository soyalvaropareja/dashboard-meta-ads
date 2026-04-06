import { useState, useMemo } from 'react'
import { useMetaApi } from '../../hooks/useMetaApi'
import { useAccount } from '../../context/AccountContext'
import { useSelection } from '../../context/SelectionContext'
import { DataTable, type Column, type FilterConfig } from '../common/DataTable'
import { SensitiveText } from '../common/SensitiveText'
import { SensitiveNumber } from '../common/SensitiveNumber'
import { SkeletonTable } from '../common/SkeletonLoader'
import { HealthBanner } from '../common/HealthBanner'
import { AuditPanel } from '../common/AuditPanel'
import type { InsightRow } from '../../types/meta'
import { extractRoas, getPrimaryResult } from '../../types/meta'
import { getHealthSummary, auditRows } from '../../lib/auditEngine'
import type { AuditRecommendation } from '../../types/audit'

function RankingBadge({ value }: { value?: string }) {
  if (!value || value === 'UNKNOWN') return <span style={{ color: 'var(--text-muted)' }}>—</span>

  const normalized = value.toLowerCase().replace(/_/g, ' ')
  let className = 'ranking '

  if (normalized.includes('above')) className += 'above-average'
  else if (normalized.includes('below')) className += 'below-average'
  else className += 'average'

  const labels: Record<string, string> = {
    'above_average': 'Arriba',
    'average': 'Promedio',
    'below_average_10': 'Abajo 10%',
    'below_average_20': 'Abajo 20%',
    'below_average_35': 'Abajo 35%',
  }

  return <span className={className}>{labels[value] || normalized}</span>
}

export function AdsTab() {
  const { selectedAccount } = useAccount()
  const { selectEntity, selectedEntity } = useSelection()
  const { data, loading, error } = useMetaApi<InsightRow[]>('ads')
  const currency = selectedAccount?.currency || 'MXN'
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const rows = data || []
  const healthSummary = useMemo(() => getHealthSummary(rows), [rows])
  const recommendations = useMemo(() => auditRows(rows, 'ad'), [rows])

  if (loading) return <SkeletonTable />
  if (error) return <div className="error-banner">Error: {error}</div>

  const columns: Column<InsightRow>[] = [
    {
      key: 'ad_name',
      label: 'Anuncio',
      priority: 'high',
      render: (row) => <SensitiveText>{row.ad_name || '—'}</SensitiveText>,
      sortValue: (row) => row.ad_name || '',
    },
    {
      key: 'adset_name',
      label: 'Conjunto',
      priority: 'low',
      render: (row) => <SensitiveText>{row.adset_name || '—'}</SensitiveText>,
      sortValue: (row) => row.adset_name || '',
    },
    {
      key: 'spend',
      label: 'Gasto',
      priority: 'high',
      render: (row) => <SensitiveNumber value={parseFloat(row.spend) || 0} format="currency" currency={currency} />,
      sortValue: (row) => parseFloat(row.spend) || 0,
    },
    {
      key: 'impressions',
      label: 'Impresiones',
      priority: 'high',
      render: (row) => (parseFloat(row.impressions) || 0).toLocaleString('es-MX'),
      sortValue: (row) => parseFloat(row.impressions) || 0,
    },
    {
      key: 'clicks',
      label: 'Clicks',
      priority: 'high',
      render: (row) => (parseFloat(row.clicks) || 0).toLocaleString('es-MX'),
      sortValue: (row) => parseFloat(row.clicks) || 0,
    },
    {
      key: 'ctr',
      label: 'CTR',
      priority: 'high',
      render: (row) => {
        const v = parseFloat(row.ctr) || 0
        const color = v >= 2 ? 'var(--accent-green)' : v < 1 ? 'var(--accent-red)' : undefined
        return <span style={{ color }}>{v.toFixed(2)}%</span>
      },
      sortValue: (row) => parseFloat(row.ctr) || 0,
    },
    {
      key: 'cpc',
      label: 'CPC',
      priority: 'low',
      render: (row) => <SensitiveNumber value={parseFloat(row.cpc) || 0} format="currency" currency={currency} />,
      sortValue: (row) => parseFloat(row.cpc) || 0,
    },
    {
      key: 'results',
      label: 'Resultados',
      priority: 'low',
      render: (row) => {
        const r = getPrimaryResult(row)
        return r.value ? <span title={r.label}>{r.value.toLocaleString('es-MX')} <small style={{ color: 'var(--text-secondary)', fontSize: '0.75em' }}>{r.label}</small></span> : '—'
      },
      sortValue: (row) => getPrimaryResult(row).value,
    },
    {
      key: 'cost_per_result',
      label: 'Costo/Resultado',
      priority: 'low',
      render: (row) => {
        const r = getPrimaryResult(row)
        return r.cost ? <><SensitiveNumber value={r.cost} format="currency" currency={currency} /> <small style={{ color: 'var(--text-secondary)', fontSize: '0.75em' }}>{r.costLabel}</small></> : '—'
      },
      sortValue: (row) => getPrimaryResult(row).cost,
    },
    {
      key: 'roas',
      label: 'ROAS',
      priority: 'high',
      render: (row) => {
        const v = extractRoas(row)
        if (!v) return '—'
        const color = v >= 3 ? 'var(--accent-green)' : v < 1 ? 'var(--accent-red)' : 'var(--accent-yellow)'
        return <span style={{ color, fontWeight: 600 }}>{v.toFixed(2)}x</span>
      },
      sortValue: (row) => extractRoas(row),
    },
    {
      key: 'quality',
      label: 'Calidad',
      priority: 'low',
      render: (row) => <RankingBadge value={row.quality_ranking} />,
      sortValue: (row) => row.quality_ranking || '',
    },
    {
      key: 'engagement',
      label: 'Engagement',
      priority: 'low',
      render: (row) => <RankingBadge value={row.engagement_rate_ranking} />,
      sortValue: (row) => row.engagement_rate_ranking || '',
    },
    {
      key: 'conversion',
      label: 'Conversion',
      priority: 'low',
      render: (row) => <RankingBadge value={row.conversion_rate_ranking} />,
      sortValue: (row) => row.conversion_rate_ranking || '',
    },
  ]

  const handleRowClick = (row: InsightRow, index: number) => {
    const newIndex = selectedIndex === index ? null : index
    setSelectedIndex(newIndex)
    selectEntity({
      level: 'ads',
      id: row.ad_id || '',
      name: row.ad_name || 'Sin nombre',
      row,
    })
  }

  const activeIndex = selectedEntity?.level === 'ads' ? selectedIndex : null

  const handleAuditSelect = (rec: AuditRecommendation) => {
    const idx = rows.findIndex((r) => (r.ad_id || '') === rec.entityId)
    if (idx === -1) return
    const row = rows[idx]
    setSelectedIndex(idx)
    selectEntity({
      level: 'ads',
      id: row.ad_id || '',
      name: row.ad_name || 'Sin nombre',
      row,
    })
  }

  const tableFilters: FilterConfig<InsightRow>[] = [
    {
      key: 'campaign',
      label: 'Campana',
      getOptions: (data) => [...new Set(data.map(r => r.campaign_name || '').filter(Boolean))].sort(),
      matches: (row, value) => row.campaign_name === value,
    },
    {
      key: 'adset',
      label: 'Conjunto',
      getOptions: (data) => [...new Set(data.map(r => r.adset_name || '').filter(Boolean))].sort(),
      matches: (row, value) => row.adset_name === value,
    },
  ]

  return (
    <>
      <HealthBanner summary={healthSummary} />
      <AuditPanel recommendations={recommendations} onSelect={handleAuditSelect} />
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={handleRowClick}
        selectedRowIndex={activeIndex}
        searchPlaceholder="Buscar anuncio..."
        searchField={(row) => `${row.ad_name || ''} ${row.adset_name || ''}`}
        filters={tableFilters}
      />
    </>
  )
}
