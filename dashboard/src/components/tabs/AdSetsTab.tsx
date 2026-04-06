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

export function AdSetsTab() {
  const { selectedAccount } = useAccount()
  const { selectEntity, selectedEntity } = useSelection()
  const { data, loading, error } = useMetaApi<InsightRow[]>('adsets')
  const currency = selectedAccount?.currency || 'MXN'
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const rows = data || []
  const healthSummary = useMemo(() => getHealthSummary(rows), [rows])
  const recommendations = useMemo(() => auditRows(rows, 'adset'), [rows])

  if (loading) return <SkeletonTable />
  if (error) return <div className="error-banner">Error: {error}</div>

  const columns: Column<InsightRow>[] = [
    {
      key: 'adset_name',
      label: 'Conjunto',
      priority: 'high',
      render: (row) => <SensitiveText>{row.adset_name || '—'}</SensitiveText>,
      sortValue: (row) => row.adset_name || '',
    },
    {
      key: 'campaign_name',
      label: 'Campana',
      priority: 'low',
      render: (row) => <SensitiveText>{row.campaign_name || '—'}</SensitiveText>,
      sortValue: (row) => row.campaign_name || '',
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
      key: 'reach',
      label: 'Alcance',
      priority: 'low',
      render: (row) => (parseFloat(row.reach) || 0).toLocaleString('es-MX'),
      sortValue: (row) => parseFloat(row.reach) || 0,
    },
    {
      key: 'frequency',
      label: 'Frecuencia',
      priority: 'low',
      render: (row) => {
        const v = parseFloat(row.frequency) || 0
        const color = v > 4.5 ? 'var(--accent-red)' : v > 3 ? 'var(--accent-yellow)' : undefined
        return <span style={{ color }}>{v.toFixed(2)}</span>
      },
      sortValue: (row) => parseFloat(row.frequency) || 0,
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
      key: 'cpm',
      label: 'CPM',
      priority: 'low',
      render: (row) => <SensitiveNumber value={parseFloat(row.cpm) || 0} format="currency" currency={currency} />,
      sortValue: (row) => parseFloat(row.cpm) || 0,
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
  ]

  const handleRowClick = (row: InsightRow, index: number) => {
    const newIndex = selectedIndex === index ? null : index
    setSelectedIndex(newIndex)
    selectEntity({
      level: 'adsets',
      id: row.adset_id || '',
      name: row.adset_name || 'Sin nombre',
      row,
    })
  }

  const activeIndex = selectedEntity?.level === 'adsets' ? selectedIndex : null

  const handleAuditSelect = (rec: AuditRecommendation) => {
    const idx = rows.findIndex((r) => (r.adset_id || '') === rec.entityId)
    if (idx === -1) return
    const row = rows[idx]
    setSelectedIndex(idx)
    selectEntity({
      level: 'adsets',
      id: row.adset_id || '',
      name: row.adset_name || 'Sin nombre',
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
        searchPlaceholder="Buscar conjunto de anuncios..."
        searchField={(row) => `${row.adset_name || ''} ${row.campaign_name || ''}`}
        filters={tableFilters}
      />
    </>
  )
}
