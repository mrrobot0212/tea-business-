import React, { useState, useEffect, useCallback } from 'react'
import {
  PlusCircle, X, ChevronDown, AlertTriangle, TrendingUp,
  TrendingDown, Wallet, Users, Edit2, ArrowUpCircle, ArrowDownCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../lib/database.types'

type Partner     = Database['public']['Tables']['partners']['Row']
type Investment  = Database['public']['Tables']['partner_investments']['Row']

type InvestmentType = 'initial' | 'additional' | 'withdrawal' | 'profit'

const TRANSACTION_TYPES: { value: InvestmentType; label: string }[] = [
  { value: 'initial',    label: 'Initial Capital' },
  { value: 'additional', label: 'Additional Investment' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'profit',     label: 'Profit Distribution' },
]

const PARTNER_COLORS = ['#15803d', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']

interface InvestmentForm {
  partner_id: string
  type: InvestmentType
  amount: string
  date: string
  notes: string
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

interface PartnerStats {
  partner: Partner
  totalInvested: number
  totalWithdrawals: number
  totalProfit: number
  netInvestment: number
  transactions: Investment[]
}

export default function Partners() {
  const { partner: currentPartner } = useAuth()
  const isAdmin = currentPartner?.role === 'admin'

  const [partners, setPartners]       = useState<Partner[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null)

  // Add transaction modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<InvestmentForm>({
    partner_id: '',
    type: 'additional',
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  // Profit share edit
  const [editSharePartnerId, setEditSharePartnerId] = useState<string | null>(null)
  const [shareInput, setShareInput] = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: partnersData }, { data: invData }] = await Promise.all([
      supabase.from('partners').select('*').eq('is_active', true).order('name'),
      supabase.from('partner_investments').select('*').order('date', { ascending: false }),
    ])
    setPartners(partnersData ?? [])
    setInvestments(invData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Stats per partner ──────────────────────────────────────────────────────
  const partnerStats: PartnerStats[] = partners.map(p => {
    const txns = investments.filter(i => i.partner_id === p.id)
    const totalInvested    = txns.filter(i => i.type === 'initial' || i.type === 'additional').reduce((s, i) => s + i.amount, 0)
    const totalWithdrawals = txns.filter(i => i.type === 'withdrawal').reduce((s, i) => s + i.amount, 0)
    const totalProfit      = txns.filter(i => i.type === 'profit').reduce((s, i) => s + i.amount, 0)
    const netInvestment    = totalInvested - totalWithdrawals + totalProfit
    return { partner: p, totalInvested, totalWithdrawals, totalProfit, netInvestment, transactions: txns }
  })

  const totalCapital = partnerStats.reduce((s, ps) => s + ps.netInvestment, 0)

  // Pie data
  const pieData = partnerStats.map((ps, idx) => ({
    name: ps.partner.name,
    value: Math.max(ps.netInvestment, 0),
    color: PARTNER_COLORS[idx % PARTNER_COLORS.length],
  }))

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openAdd(partnerId?: string) {
    setForm({
      partner_id: partnerId ?? (partners[0]?.id ?? ''),
      type: 'additional',
      amount: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.partner_id || !form.amount || !form.date) {
      toast.error('Please fill all required fields')
      return
    }
    if (!currentPartner) return
    setSaving(true)

    const { error } = await supabase.from('partner_investments').insert({
      partner_id: form.partner_id,
      type: form.type,
      amount: parseFloat(form.amount),
      date: form.date,
      notes: form.notes || null,
      created_by: currentPartner.id,
    })

    if (error) { toast.error('Failed to add transaction'); setSaving(false); return }

    await supabase.from('activity_logs').insert({
      partner_id: currentPartner.id,
      action: 'INSERT',
      table_name: 'partner_investments',
      new_values: {
        partner_id: form.partner_id,
        type: form.type,
        amount: parseFloat(form.amount),
      } as any,
    })

    toast.success('Transaction recorded')
    setSaving(false)
    setShowModal(false)
    fetchData()
  }

  // ── Profit share: for display only (we can store in partner metadata if needed) ──
  // Computed as share of net investment; editable purely as UI annotation.
  function computedShare(ps: PartnerStats) {
    if (totalCapital === 0) return 0
    return (ps.netInvestment / totalCapital) * 100
  }

  // ─────────────────────────────────────────────────────────────────────────
  const activeTxns = selectedPartner
    ? investments.filter(i => i.partner_id === selectedPartner)
    : []

  const typeLabel: Record<InvestmentType, string> = {
    initial: 'Initial Capital',
    additional: 'Additional Investment',
    withdrawal: 'Withdrawal',
    profit: 'Profit Distribution',
  }

  const typeBadge: Record<InvestmentType, string> = {
    initial:    'badge-blue',
    additional: 'badge-green',
    withdrawal: 'badge-red',
    profit:     'badge-yellow',
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Partner Financials</h1>
          <p className="page-subtitle">Investments, withdrawals, and profit distributions</p>
        </div>
        {isAdmin && (
          <button onClick={() => openAdd()} className="btn-primary flex items-center gap-2">
            <PlusCircle size={18} />
            Add Transaction
          </button>
        )}
      </div>

      {/* Total Capital Banner */}
      <div className="card bg-gradient-to-r from-primary-700 to-green-500 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-100 text-sm font-medium">Total Business Capital</p>
            <p className="text-4xl font-bold mt-1">৳{totalCapital.toLocaleString()}</p>
            <p className="text-green-100 text-sm mt-1">{partners.length} active partner{partners.length !== 1 ? 's' : ''}</p>
          </div>
          <Wallet size={48} className="text-white/40" />
        </div>
      </div>

      {/* Partner Cards */}
      {loading ? (
        <div className="text-center text-gray-400 py-16">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {partnerStats.map((ps, idx) => (
            <div key={ps.partner.id} className="card border border-gray-100 hover:shadow-md transition-shadow">
              {/* Avatar + name */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                  style={{ backgroundColor: PARTNER_COLORS[idx % PARTNER_COLORS.length] }}
                >
                  {getInitials(ps.partner.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{ps.partner.name}</p>
                  <span className={`text-xs capitalize ${ps.partner.role === 'admin' ? 'badge-blue' : 'badge-gray'}`}>
                    {ps.partner.role}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1">
                    <ArrowUpCircle size={13} className="text-green-500" /> Invested
                  </span>
                  <span className="font-medium text-gray-800">৳{ps.totalInvested.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1">
                    <ArrowDownCircle size={13} className="text-red-500" /> Withdrawn
                  </span>
                  <span className="font-medium text-red-600">৳{ps.totalWithdrawals.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1">
                    <TrendingUp size={13} className="text-yellow-500" /> Profit Dist.
                  </span>
                  <span className="font-medium text-yellow-600">৳{ps.totalProfit.toLocaleString()}</span>
                </div>
                <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-700">Net Capital</span>
                  <span className="text-base font-bold text-primary-700">৳{ps.netInvestment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Share %</span>
                  <span className="text-xs font-semibold text-primary-700">{computedShare(ps).toFixed(1)}%</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setSelectedPartner(ps.partner.id === selectedPartner ? null : ps.partner.id)}
                  className={`flex-1 text-xs py-1.5 px-3 rounded-lg font-medium transition-colors ${
                    selectedPartner === ps.partner.id
                      ? 'bg-primary-700 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {selectedPartner === ps.partner.id ? 'Hide History' : 'View History'}
                </button>
                {isAdmin && (
                  <button
                    onClick={() => openAdd(ps.partner.id)}
                    className="text-xs py-1.5 px-3 rounded-lg bg-green-50 text-primary-700 hover:bg-green-100 font-medium transition-colors"
                  >
                    + Add
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Partner Transaction History */}
      {selectedPartner && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">
              Transaction History — {partners.find(p => p.id === selectedPartner)?.name}
            </h2>
            <button onClick={() => setSelectedPartner(null)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X size={16} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Type</th>
                  <th className="table-header text-right">Amount</th>
                  <th className="table-header">Notes</th>
                </tr>
              </thead>
              <tbody>
                {activeTxns.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="table-cell text-center text-gray-400 py-8">
                      No transactions yet
                    </td>
                  </tr>
                ) : (
                  activeTxns.map(txn => (
                    <tr key={txn.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">{format(parseISO(txn.date), 'dd MMM yyyy')}</td>
                      <td className="table-cell">
                        <span className={typeBadge[txn.type]}>
                          {typeLabel[txn.type]}
                        </span>
                      </td>
                      <td className={`table-cell text-right font-semibold ${
                        txn.type === 'withdrawal' ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {txn.type === 'withdrawal' ? '-' : '+'}৳{txn.amount.toLocaleString()}
                      </td>
                      <td className="table-cell text-sm text-gray-500">{txn.notes ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pie Chart */}
      {!loading && partners.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Capital Distribution</h2>
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`৳${v.toLocaleString()}`, 'Capital']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>

            {/* Summary table beside pie */}
            <div className="w-full lg:w-72 flex-shrink-0">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left text-gray-500 pb-2">Partner</th>
                    <th className="text-right text-gray-500 pb-2">Capital</th>
                    <th className="text-right text-gray-500 pb-2">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {partnerStats.map((ps, idx) => (
                    <tr key={ps.partner.id} className="border-t border-gray-100">
                      <td className="py-2 flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: PARTNER_COLORS[idx % PARTNER_COLORS.length] }}
                        />
                        {ps.partner.name}
                      </td>
                      <td className="py-2 text-right font-medium">৳{ps.netInvestment.toLocaleString()}</td>
                      <td className="py-2 text-right text-primary-700 font-semibold">
                        {computedShare(ps).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Add Transaction</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Partner */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Partner <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={form.partner_id}
                    onChange={e => setForm(f => ({ ...f, partner_id: e.target.value }))}
                    className="input-field appearance-none pr-8"
                  >
                    {partners.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transaction Type <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as InvestmentType }))}
                    className="input-field appearance-none pr-8"
                  >
                    {TRANSACTION_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (৳) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="input-field"
                  placeholder="0.00"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="input-field"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="input-field resize-none"
                  placeholder="Optional notes…"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Record Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
