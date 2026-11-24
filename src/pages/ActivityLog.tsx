import React, { useEffect, useState, useCallback } from 'react'
import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDateTime, getInitials } from '../utils/formatters'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type ActivityLog = Database['public']['Tables']['activity_logs']['Row']
type Partner = Database['public']['Tables']['partners']['Row']

interface LogWithPartner extends ActivityLog {
  partner: Pick<Partner, 'id' | 'name'> | null
}

const PAGE_SIZE = 20

// ─── Action badge ─────────────────────────────────────────────────────────────
const ACTION_STYLES: Record<string, string> = {
  CREATE: 'badge-green',
  UPDATE: 'badge-blue',
  DELETE: 'badge-red',
}

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_STYLES[action.toUpperCase()] ?? 'badge-gray'
  return <span className={cls}>{action.toUpperCase()}</span>
}

// ─── Avatar colours ───────────────────────────────────────────────────────────
const AVATAR_COLOURS = [
  'bg-green-100 text-green-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]
function avatarColour(name: string) {
  return AVATAR_COLOURS[name.charCodeAt(0) % AVATAR_COLOURS.length]
}

// ─── JSON diff display ────────────────────────────────────────────────────────
interface DiffProps {
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  action: string
}

function JsonDiff({ oldValues, newValues, action }: DiffProps) {
  if (!oldValues && !newValues) return <span className="text-gray-400 text-xs">—</span>

  const act = action.toUpperCase()

  if (act === 'DELETE' && oldValues) {
    return (
      <details className="text-xs">
        <summary className="cursor-pointer text-red-500 font-medium">Deleted record</summary>
        <pre className="mt-1 bg-red-50 text-red-700 p-2 rounded text-[11px] overflow-auto max-w-xs max-h-32">
          {JSON.stringify(oldValues, null, 2)}
        </pre>
      </details>
    )
  }

  if (act === 'CREATE' && newValues) {
    return (
      <details className="text-xs">
        <summary className="cursor-pointer text-green-600 font-medium">New record</summary>
        <pre className="mt-1 bg-green-50 text-green-700 p-2 rounded text-[11px] overflow-auto max-w-xs max-h-32">
          {JSON.stringify(newValues, null, 2)}
        </pre>
      </details>
    )
  }

  if (act === 'UPDATE' && oldValues && newValues) {
    // Show only changed fields
    const allKeys = Array.from(
      new Set([...Object.keys(oldValues), ...Object.keys(newValues)]),
    )
    const changed = allKeys.filter(
      (k) => JSON.stringify(oldValues[k]) !== JSON.stringify(newValues[k]),
    )

    if (changed.length === 0) return <span className="text-gray-400 text-xs">No changes</span>

    return (
      <details className="text-xs">
        <summary className="cursor-pointer text-blue-600 font-medium">
          {changed.length} field{changed.length > 1 ? 's' : ''} changed
        </summary>
        <div className="mt-1 space-y-1 max-h-40 overflow-auto">
          {changed.map((k) => (
            <div key={k} className="rounded bg-gray-50 p-1.5">
              <span className="font-medium text-gray-700">{k}:</span>
              <div className="flex gap-1 items-center flex-wrap mt-0.5">
                <span className="bg-red-100 text-red-600 px-1 rounded line-through text-[11px]">
                  {JSON.stringify(oldValues[k])}
                </span>
                <span className="text-gray-400">→</span>
                <span className="bg-green-100 text-green-600 px-1 rounded text-[11px]">
                  {JSON.stringify(newValues[k])}
                </span>
              </div>
            </div>
          ))}
        </div>
      </details>
    )
  }

  // Fallback: just show newValues
  if (newValues) {
    return (
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-500 font-medium">View data</summary>
        <pre className="mt-1 bg-gray-50 text-gray-700 p-2 rounded text-[11px] overflow-auto max-w-xs max-h-32">
          {JSON.stringify(newValues, null, 2)}
        </pre>
      </details>
    )
  }

  return <span className="text-gray-400 text-xs">—</span>
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ActivityLog() {
  const [logs, setLogs] = useState<LogWithPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [partners, setPartners] = useState<Pick<Partner, 'id' | 'name'>[]>([])

  // Filters
  const [filterPartner, setFilterPartner] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterTable, setFilterTable] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Fetch partner list for filter dropdown
  useEffect(() => {
    supabase
      .from('partners')
      .select('id, name')
      .order('name')
      .then(({ data }) => setPartners(data ?? []))
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('activity_logs')
      .select('*, partner:partners!activity_logs_partner_id_fkey(id, name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (filterPartner) query = query.eq('partner_id', filterPartner)
    if (filterAction) query = query.ilike('action', filterAction)
    if (filterTable) query = query.ilike('table_name', filterTable)
    if (filterFrom) query = query.gte('created_at', filterFrom)
    if (filterTo) {
      // include the whole "to" day
      const toEnd = `${filterTo}T23:59:59`
      query = query.lte('created_at', toEnd)
    }

    const { data, error, count } = await query

    if (error) {
      toast.error('Failed to load activity log')
    } else {
      setLogs((data ?? []) as unknown as LogWithPartner[])
      setTotalCount(count ?? 0)
    }
    setLoading(false)
  }, [page, filterPartner, filterAction, filterTable, filterFrom, filterTo])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  function handleFilterChange() {
    setPage(0)
    fetchLogs()
  }

  function clearFilters() {
    setFilterPartner('')
    setFilterAction('')
    setFilterTable('')
    setFilterFrom('')
    setFilterTo('')
    setPage(0)
  }

  const hasFilters = filterPartner || filterAction || filterTable || filterFrom || filterTo

  // Distinct table names already in state for a quick filter helper
  const tableNames = Array.from(new Set(logs.map((l) => l.table_name))).sort()

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary-700" />
            Activity Log
          </h1>
          <p className="page-subtitle">Complete audit trail of all partner actions</p>
        </div>
        <button
          onClick={() => { clearFilters(); fetchLogs() }}
          className="btn-secondary flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4 text-sm font-medium text-gray-700">
          <Filter className="h-4 w-4 text-gray-500" />
          Filters
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-primary-700 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Partner */}
          <select
            className="input-field"
            value={filterPartner}
            onChange={(e) => { setFilterPartner(e.target.value); setPage(0) }}
          >
            <option value="">All Partners</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Action */}
          <select
            className="input-field"
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(0) }}
          >
            <option value="">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>

          {/* Table */}
          <select
            className="input-field"
            value={filterTable}
            onChange={(e) => { setFilterTable(e.target.value); setPage(0) }}
          >
            <option value="">All Tables</option>
            {tableNames.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Date from */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              className="input-field"
              value={filterFrom}
              onChange={(e) => { setFilterFrom(e.target.value); setPage(0) }}
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              className="input-field"
              value={filterTo}
              onChange={(e) => { setFilterTo(e.target.value); setPage(0) }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">Timestamp</th>
                <th className="table-header">Partner</th>
                <th className="table-header">Action</th>
                <th className="table-header">Table</th>
                <th className="table-header">Record ID</th>
                <th className="table-header">Changes</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <span className="animate-spin rounded-full h-6 w-6 border-4 border-primary-700 border-t-transparent inline-block" />
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-gray-400">
                    No activity records found.
                  </td>
                </tr>
              )}
              {!loading &&
                logs.map((log) => {
                  const name = log.partner?.name ?? 'Unknown'
                  const colour = avatarColour(name)
                  return (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      {/* Timestamp */}
                      <td className="table-cell whitespace-nowrap text-xs text-gray-500">
                        {formatDateTime(log.created_at)}
                      </td>

                      {/* Partner */}
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${colour}`}
                          >
                            {getInitials(name)}
                          </div>
                          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                            {name}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="table-cell">
                        <ActionBadge action={log.action} />
                      </td>

                      {/* Table */}
                      <td className="table-cell">
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {log.table_name}
                        </span>
                      </td>

                      {/* Record ID */}
                      <td className="table-cell">
                        {log.record_id ? (
                          <span className="font-mono text-xs text-gray-500 truncate max-w-[100px] block">
                            {log.record_id}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Changes */}
                      <td className="table-cell max-w-[280px]">
                        <JsonDiff
                          action={log.action}
                          oldValues={log.old_values as Record<string, unknown> | null}
                          newValues={log.new_values as Record<string, unknown> | null}
                        />
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing{' '}
              <span className="font-medium">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)}
              </span>{' '}
              of <span className="font-medium">{totalCount}</span> records
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600 font-medium">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
