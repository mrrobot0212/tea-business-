import React, { useState, useEffect, useCallback } from 'react'
import {
  PlusCircle, Pencil, Trash2, X, ChevronDown, AlertTriangle,
  TrendingDown, Calendar, Filter, DollarSign
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../lib/database.types'

type Expense = Database['public']['Tables']['expenses']['Row']
type Partner = Database['public']['Tables']['partners']['Row']

const CATEGORIES = [
  'All',
  'Transportation',
  'Packaging',
  'Salary',
  'Rent',
  'Marketing',
  'Electricity',
  'Other',
]

const CATEGORY_COLORS: Record<string, string> = {
  Transportation: '#3b82f6',
  Packaging:      '#8b5cf6',
  Salary:         '#f59e0b',
  Rent:           '#ef4444',
  Marketing:      '#06b6d4',
  Electricity:    '#10b981',
  Other:          '#6b7280',
}

interface ExpenseForm {
  date: string
  category: string
  amount: string
  description: string
  notes: string
}

const emptyForm: ExpenseForm = {
  date: format(new Date(), 'yyyy-MM-dd'),
  category: 'Transportation',
  amount: '',
  description: '',
  notes: '',
}

export default function Expenses() {
  const { partner } = useAuth()

  // Data
  const [expenses, setExpenses]   = useState<Expense[]>([])
  const [partners, setPartners]   = useState<Partner[]>([])
  const [loading, setLoading]     = useState(true)

  // Filters
  const [activeCategory, setActiveCategory] = useState('All')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  // Modal
  const [showModal, setShowModal]       = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [form, setForm]                 = useState<ExpenseForm>(emptyForm)
  const [saving, setSaving]             = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [deleting, setDeleting]         = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })
    if (error) toast.error('Failed to load expenses')
    else setExpenses(data ?? [])
    setLoading(false)
  }, [])

  const fetchPartners = useCallback(async () => {
    const { data } = await supabase.from('partners').select('*')
    setPartners(data ?? [])
  }, [])

  useEffect(() => {
    fetchExpenses()
    fetchPartners()
  }, [fetchExpenses, fetchPartners])

  // ── Derived / filtered ─────────────────────────────────────────────────────
  const now = new Date()
  const monthStart = startOfMonth(now).toISOString().slice(0, 10)
  const monthEnd   = endOfMonth(now).toISOString().slice(0, 10)
  const yearStart  = startOfYear(now).toISOString().slice(0, 10)
  const yearEnd    = endOfYear(now).toISOString().slice(0, 10)

  const thisMonthExpenses = expenses.filter(e => e.date >= monthStart && e.date <= monthEnd)
  const thisYearExpenses  = expenses.filter(e => e.date >= yearStart  && e.date <= yearEnd)

  const thisMonthTotal = thisMonthExpenses.reduce((s, e) => s + e.amount, 0)
  const thisYearTotal  = thisYearExpenses.reduce((s, e) => s + e.amount, 0)

  // Top 3 categories this month
  const categoryTotals = CATEGORIES.slice(1).map(cat => ({
    category: cat,
    total: thisMonthExpenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).sort((a, b) => b.total - a.total)

  // Filtered table data
  const filtered = expenses.filter(e => {
    if (activeCategory !== 'All' && e.category !== activeCategory) return false
    if (dateFrom && e.date < dateFrom) return false
    if (dateTo   && e.date > dateTo)   return false
    return true
  })

  // Bar chart – category totals for current month
  const barData = CATEGORIES.slice(1).map(cat => ({
    name: cat.substring(0, 4),
    amount: thisMonthExpenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  }))

  // Monthly trend – last 6 months
  const trendData: { month: string; amount: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = startOfMonth(d).toISOString().slice(0, 10)
    const end   = endOfMonth(d).toISOString().slice(0, 10)
    const total = expenses.filter(e => e.date >= start && e.date <= end).reduce((s, e) => s + e.amount, 0)
    trendData.push({ month: format(d, 'MMM yy'), amount: total })
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openAdd() {
    setEditingExpense(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(exp: Expense) {
    setEditingExpense(exp)
    setForm({
      date: exp.date,
      category: exp.category,
      amount: String(exp.amount),
      description: exp.description,
      notes: exp.receipt_url ?? '',
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingExpense(null)
    setForm(emptyForm)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.date || !form.category || !form.amount || !form.description) {
      toast.error('Please fill all required fields')
      return
    }
    if (!partner) return
    setSaving(true)

    const payload = {
      date: form.date,
      category: form.category,
      amount: parseFloat(form.amount),
      description: form.description,
      receipt_url: form.notes || null,
    }

    if (editingExpense) {
      const { error } = await supabase
        .from('expenses')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingExpense.id)
      if (error) { toast.error('Failed to update expense'); setSaving(false); return }

      await supabase.from('activity_logs').insert({
        partner_id: partner.id,
        action: 'UPDATE',
        table_name: 'expenses',
        record_id: editingExpense.id,
        old_values: { amount: editingExpense.amount, category: editingExpense.category } as any,
        new_values: payload as any,
      })
      toast.success('Expense updated')
    } else {
      const { data, error } = await supabase
        .from('expenses')
        .insert({ ...payload, created_by: partner.id })
        .select()
        .single()
      if (error) { toast.error('Failed to add expense'); setSaving(false); return }

      await supabase.from('activity_logs').insert({
        partner_id: partner.id,
        action: 'INSERT',
        table_name: 'expenses',
        record_id: data.id,
        new_values: payload as any,
      })
      toast.success('Expense added')
    }

    setSaving(false)
    closeModal()
    fetchExpenses()
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget || !partner) return
    setDeleting(true)
    const { error } = await supabase.from('expenses').delete().eq('id', deleteTarget.id)
    if (error) { toast.error('Failed to delete expense'); setDeleting(false); return }

    await supabase.from('activity_logs').insert({
      partner_id: partner.id,
      action: 'DELETE',
      table_name: 'expenses',
      record_id: deleteTarget.id,
      old_values: { amount: deleteTarget.amount, category: deleteTarget.category } as any,
    })
    toast.success('Expense deleted')
    setDeleting(false)
    setDeleteTarget(null)
    fetchExpenses()
  }

  // ── Partner name lookup ────────────────────────────────────────────────────
  function partnerName(id: string) {
    return partners.find(p => p.id === id)?.name ?? '—'
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Expense Management</h1>
          <p className="page-subtitle">Track and manage all business expenses</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <PlusCircle size={18} />
          Add Expense
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="stat-card col-span-1 md:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">This Month</span>
            <TrendingDown size={18} className="text-red-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">৳{thisMonthTotal.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{thisMonthExpenses.length} transactions</p>
        </div>

        <div className="stat-card col-span-1 md:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">This Year</span>
            <DollarSign size={18} className="text-orange-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">৳{thisYearTotal.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{thisYearExpenses.length} transactions</p>
        </div>

        {categoryTotals.slice(0, 3).map(ct => (
          <div key={ct.category} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">{ct.category}</span>
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[ct.category] }}
              />
            </div>
            <p className="text-xl font-bold text-gray-900">৳{ct.total.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">This month</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Filter size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-600">Category:</span>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-primary-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Calendar size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-600">Date Range:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="input-field py-1.5 text-sm w-auto"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="input-field py-1.5 text-sm w-auto"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs text-primary-700 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Date</th>
                <th className="table-header">Category</th>
                <th className="table-header">Description</th>
                <th className="table-header text-right">Amount</th>
                <th className="table-header">Added By</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="table-cell text-center text-gray-400 py-10">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-cell text-center text-gray-400 py-10">
                    No expenses found
                  </td>
                </tr>
              ) : (
                filtered.map(exp => (
                  <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">{format(parseISO(exp.date), 'dd MMM yyyy')}</td>
                    <td className="table-cell">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: CATEGORY_COLORS[exp.category] ?? '#6b7280' }}
                      >
                        {exp.category}
                      </span>
                    </td>
                    <td className="table-cell max-w-xs truncate">{exp.description}</td>
                    <td className="table-cell text-right font-semibold text-red-600">
                      ৳{exp.amount.toLocaleString()}
                    </td>
                    <td className="table-cell text-sm text-gray-500">{partnerName(exp.created_by)}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(exp)}
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(exp)}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center text-sm text-gray-500">
            <span>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-gray-700">
              Total: ৳{filtered.reduce((s, e) => s + e.amount, 0).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">This Month by Category</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `৳${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [`৳${v.toLocaleString()}`, 'Amount']} />
              <Bar dataKey="amount" fill="#15803d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Line Chart */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Monthly Trend (Last 6 Months)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `৳${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [`৳${v.toLocaleString()}`, 'Total']} />
              <Legend />
              <Line
                type="monotone"
                dataKey="amount"
                name="Expenses"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingExpense ? 'Edit Expense' : 'Add Expense'}
              </h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
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

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="input-field appearance-none pr-8"
                  >
                    {CATEGORIES.slice(1).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
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

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="input-field"
                  placeholder="Brief description…"
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
                  placeholder="Additional notes…"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={closeModal} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : editingExpense ? 'Update' : 'Add Expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-red-50 rounded-full">
                <AlertTriangle size={28} className="text-red-500" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Delete Expense?</h3>
            <p className="text-sm text-gray-500 mb-1">
              <strong>{deleteTarget.category}</strong> — {deleteTarget.description}
            </p>
            <p className="text-sm text-red-600 font-semibold mb-5">
              ৳{deleteTarget.amount.toLocaleString()}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="btn-secondary flex-1"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
