import React, { useEffect, useState, useCallback } from 'react'
import {
  Users,
  UserCheck,
  TrendingUp,
  AlertCircle,
  Search,
  Filter,
  Plus,
  Edit2,
  Eye,
  X,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  ArrowUpCircle,
  ArrowDownCircle,
  ChevronDown,
  Wallet,
  FileText,
  BarChart2,
  CheckCircle,
} from 'lucide-react'
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../lib/database.types'

type Customer = Database['public']['Tables']['customers']['Row']
type Sale = Database['public']['Tables']['sales']['Row']
type SaleItem = Database['public']['Tables']['sale_items']['Row']
type Payment = Database['public']['Tables']['payments']['Row']

type SaleWithItems = Sale & {
  sale_items: (SaleItem & { products: { name: string } | null })[]
}

type PaymentMethod = 'cash' | 'bkash' | 'nagad' | 'bank'

interface CustomerForm {
  shop_name: string
  owner_name: string
  phone: string
  alt_phone: string
  address: string
  area: string
  status: 'active' | 'inactive'
  notes: string
}

interface LedgerEntry {
  date: string
  type: 'purchase' | 'payment'
  description: string
  debit: number
  credit: number
  balance: number
  reference: string
}

interface MonthlyRow {
  month: string
  purchases: number
  payments: number
  net: number
}

const EMPTY_FORM: CustomerForm = {
  shop_name: '',
  owner_name: '',
  phone: '',
  alt_phone: '',
  address: '',
  area: '',
  status: 'active',
  notes: '',
}

const fmt = (n: number) =>
  '৳' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  bank: 'Bank Transfer',
}

export default function Customers() {
  const { partner } = useAuth()

  // ── List state ──────────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterArea, setFilterArea] = useState<string>('all')
  const [filterDue, setFilterDue] = useState<'all' | 'has_due' | 'no_due'>('all')

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // ── Profile state ────────────────────────────────────────────────────────────
  const [profileCustomer, setProfileCustomer] = useState<Customer | null>(null)
  const [profileTab, setProfileTab] = useState<'purchases' | 'payments' | 'ledger' | 'monthly'>('purchases')
  const [profileSales, setProfileSales] = useState<SaleWithItems[]>([])
  const [profilePayments, setProfilePayments] = useState<Payment[]>([])
  const [profileLoading, setProfileLoading] = useState(false)

  // ── Payment modal state ──────────────────────────────────────────────────────
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'cash' as PaymentMethod,
    notes: '',
  })
  const [paymentSaving, setPaymentSaving] = useState(false)

  // ── Summary cards data ───────────────────────────────────────────────────────
  const totalRevenue = customers.reduce((s, c) => s + c.total_purchased_amount, 0)
  const totalOutstanding = customers.reduce(
    (s, c) => s + (c.total_purchased_amount - c.total_paid_amount),
    0
  )
  const activeCount = customers.filter((c) => c.status === 'active').length

  // ── Unique areas for filter ──────────────────────────────────────────────────
  const areas = Array.from(new Set(customers.map((c) => c.area).filter(Boolean))) as string[]

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('shop_name', { ascending: true })
    if (error) {
      toast.error('Failed to load customers')
    } else {
      setCustomers(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      c.shop_name.toLowerCase().includes(q) ||
      c.owner_name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.area ?? '').toLowerCase().includes(q)
    const matchStatus = filterStatus === 'all' || c.status === filterStatus
    const matchArea = filterArea === 'all' || c.area === filterArea
    const outstanding = c.total_purchased_amount - c.total_paid_amount
    const matchDue =
      filterDue === 'all' ||
      (filterDue === 'has_due' && outstanding > 0) ||
      (filterDue === 'no_due' && outstanding <= 0)
    return matchSearch && matchStatus && matchArea && matchDue
  })

  // ── Form handlers ────────────────────────────────────────────────────────────
  const openAddModal = () => {
    setEditingCustomer(null)
    setForm(EMPTY_FORM)
    setShowFormModal(true)
  }

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c)
    setForm({
      shop_name: c.shop_name,
      owner_name: c.owner_name,
      phone: c.phone,
      alt_phone: c.alt_phone ?? '',
      address: c.address ?? '',
      area: c.area ?? '',
      status: c.status,
      notes: c.notes ?? '',
    })
    setShowFormModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partner) return
    setSaving(true)
    try {
      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update({
            shop_name: form.shop_name,
            owner_name: form.owner_name,
            phone: form.phone,
            alt_phone: form.alt_phone || null,
            address: form.address || null,
            area: form.area || null,
            status: form.status,
            notes: form.notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingCustomer.id)
        if (error) throw error
        toast.success('Customer updated')
      } else {
        const { error } = await supabase.from('customers').insert({
          shop_name: form.shop_name,
          owner_name: form.owner_name,
          phone: form.phone,
          alt_phone: form.alt_phone || null,
          address: form.address || null,
          area: form.area || null,
          status: form.status,
          notes: form.notes || null,
          created_by: partner.id,
        })
        if (error) throw error
        toast.success('Customer added')
      }
      setShowFormModal(false)
      fetchCustomers()
    } catch (err: any) {
      toast.error(err.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Profile ──────────────────────────────────────────────────────────────────
  const openProfile = async (c: Customer) => {
    setProfileCustomer(c)
    setProfileTab('purchases')
    setProfileLoading(true)

    const [{ data: sales }, { data: payments }] = await Promise.all([
      supabase
        .from('sales')
        .select('*, sale_items(*, products(name))')
        .eq('customer_id', c.id)
        .order('sale_date', { ascending: false }),
      supabase
        .from('payments')
        .select('*')
        .eq('customer_id', c.id)
        .order('payment_date', { ascending: false }),
    ])

    setProfileSales((sales as SaleWithItems[]) ?? [])
    setProfilePayments(payments ?? [])
    setProfileLoading(false)
  }

  const closeProfile = () => {
    setProfileCustomer(null)
    setProfileSales([])
    setProfilePayments([])
  }

  // ── Ledger computation ───────────────────────────────────────────────────────
  const computeLedger = (): LedgerEntry[] => {
    const entries: Omit<LedgerEntry, 'balance'>[] = [
      ...profileSales.map((s) => ({
        date: s.sale_date,
        type: 'purchase' as const,
        description: `Sale — ${s.invoice_number}`,
        debit: s.final_amount,
        credit: 0,
        reference: s.invoice_number,
      })),
      ...profilePayments.map((p) => ({
        date: p.payment_date,
        type: 'payment' as const,
        description: `Payment — ${paymentMethodLabel[p.payment_method]}`,
        debit: 0,
        credit: p.amount,
        reference: p.id.slice(0, 8).toUpperCase(),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date))

    let balance = 0
    return entries.map((e) => {
      balance += e.debit - e.credit
      return { ...e, balance }
    })
  }

  // ── Monthly summary ──────────────────────────────────────────────────────────
  const computeMonthly = (): MonthlyRow[] => {
    const map = new Map<string, { purchases: number; payments: number }>()
    profileSales.forEach((s) => {
      const key = s.sale_date.slice(0, 7)
      const cur = map.get(key) ?? { purchases: 0, payments: 0 }
      cur.purchases += s.final_amount
      map.set(key, cur)
    })
    profilePayments.forEach((p) => {
      const key = p.payment_date.slice(0, 7)
      const cur = map.get(key) ?? { purchases: 0, payments: 0 }
      cur.payments += p.amount
      map.set(key, cur)
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, v]) => ({
        month,
        purchases: v.purchases,
        payments: v.payments,
        net: v.purchases - v.payments,
      }))
  }

  // ── Record Payment ────────────────────────────────────────────────────────────
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partner || !profileCustomer) return
    setPaymentSaving(true)
    try {
      const amount = parseFloat(paymentForm.amount)
      if (isNaN(amount) || amount <= 0) throw new Error('Enter a valid amount')

      const { error } = await supabase.from('payments').insert({
        customer_id: profileCustomer.id,
        amount,
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
        notes: paymentForm.notes || null,
        created_by: partner.id,
      })
      if (error) throw error

      // Update customer totals
      await supabase
        .from('customers')
        .update({
          total_paid_amount: profileCustomer.total_paid_amount + amount,
          last_payment_date: paymentForm.payment_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileCustomer.id)

      toast.success('Payment recorded')
      setShowPaymentModal(false)
      setPaymentForm({
        amount: '',
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: 'cash',
        notes: '',
      })
      // Refresh profile data
      const updatedCustomer = {
        ...profileCustomer,
        total_paid_amount: profileCustomer.total_paid_amount + amount,
        last_payment_date: paymentForm.payment_date,
      }
      setProfileCustomer(updatedCustomer)
      setCustomers((prev) =>
        prev.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c))
      )
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('customer_id', profileCustomer.id)
        .order('payment_date', { ascending: false })
      setProfilePayments(payments ?? [])
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to record payment')
    } finally {
      setPaymentSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Customer Management</h1>
          <p className="page-subtitle">Manage your wholesale customers and their accounts</p>
        </div>
        <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Add Customer
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Customers</span>
            <Users size={20} className="text-primary-600" />
          </div>
          <div className="text-2xl font-bold text-gray-800">{customers.length}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Active</span>
            <UserCheck size={20} className="text-green-500" />
          </div>
          <div className="text-2xl font-bold text-gray-800">{activeCount}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Revenue</span>
            <TrendingUp size={20} className="text-blue-500" />
          </div>
          <div className="text-xl font-bold text-gray-800">{fmt(totalRevenue)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Outstanding</span>
            <AlertCircle size={20} className="text-red-500" />
          </div>
          <div className="text-xl font-bold text-red-600">{fmt(totalOutstanding)}</div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="card">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input-field pl-9"
              placeholder="Search shop name, owner, phone, area…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input-field w-full md:w-40"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            className="input-field w-full md:w-44"
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
          >
            <option value="all">All Areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            className="input-field w-full md:w-40"
            value={filterDue}
            onChange={(e) => setFilterDue(e.target.value as typeof filterDue)}
          >
            <option value="all">All Due Status</option>
            <option value="has_due">Has Due</option>
            <option value="no_due">Cleared</option>
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading customers…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No customers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="table-header">Shop Name</th>
                  <th className="table-header">Owner</th>
                  <th className="table-header">Phone</th>
                  <th className="table-header">Area</th>
                  <th className="table-header text-right">Total Purchases</th>
                  <th className="table-header text-right">Total Paid</th>
                  <th className="table-header text-right">Outstanding</th>
                  <th className="table-header">Last Purchase</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const outstanding = c.total_purchased_amount - c.total_paid_amount
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium text-gray-900">{c.shop_name}</td>
                      <td className="table-cell text-gray-700">{c.owner_name}</td>
                      <td className="table-cell text-gray-600">{c.phone}</td>
                      <td className="table-cell text-gray-500">{c.area ?? '—'}</td>
                      <td className="table-cell text-right font-medium">
                        {fmt(c.total_purchased_amount)}
                      </td>
                      <td className="table-cell text-right text-green-700">
                        {fmt(c.total_paid_amount)}
                      </td>
                      <td className="table-cell text-right">
                        {outstanding > 0 ? (
                          <span className="badge-red">{fmt(outstanding)}</span>
                        ) : (
                          <span className="badge-green">Cleared</span>
                        )}
                      </td>
                      <td className="table-cell text-gray-500 text-sm">
                        {c.last_purchase_date
                          ? format(parseISO(c.last_purchase_date), 'dd MMM yyyy')
                          : '—'}
                      </td>
                      <td className="table-cell">
                        {c.status === 'active' ? (
                          <span className="badge-green">Active</span>
                        ) : (
                          <span className="badge-gray">Inactive</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openProfile(c)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="View Profile"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => openEditModal(c)}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          Add / Edit Customer Modal
      ════════════════════════════════════════════════════════════════════════════ */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
              </h2>
              <button onClick={() => setShowFormModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Shop Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input-field"
                    value={form.shop_name}
                    onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
                    required
                    placeholder="e.g. Ahmed Tea Store"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Owner Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input-field"
                    value={form.owner_name}
                    onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                    required
                    placeholder="Owner's full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input-field"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                    placeholder="01XXXXXXXXX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Alt Phone
                  </label>
                  <input
                    className="input-field"
                    value={form.alt_phone}
                    onChange={(e) => setForm({ ...form, alt_phone: e.target.value })}
                    placeholder="Alternative number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Area / Market
                  </label>
                  <input
                    className="input-field"
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    placeholder="e.g. Karwan Bazar"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    className="input-field"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Full shop address"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional notes…"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving…' : editingCustomer ? 'Update Customer' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          Customer Profile Modal
      ════════════════════════════════════════════════════════════════════════════ */}
      {profileCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 md:p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">
            {/* Profile Header */}
            <div className="flex items-start justify-between p-5 border-b bg-gradient-to-r from-primary-50 to-green-50 rounded-t-xl">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xl font-bold">
                  {profileCustomer.shop_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{profileCustomer.shop_name}</h2>
                  <p className="text-gray-600">{profileCustomer.owner_name}</p>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Phone size={13} /> {profileCustomer.phone}
                    </span>
                    {profileCustomer.area && (
                      <span className="flex items-center gap-1">
                        <MapPin size={13} /> {profileCustomer.area}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    closeProfile()
                    openEditModal(profileCustomer)
                  }}
                  className="btn-secondary flex items-center gap-1 text-sm"
                >
                  <Edit2 size={14} /> Edit
                </button>
                <button
                  onClick={() => {
                    setShowPaymentModal(true)
                  }}
                  className="btn-primary flex items-center gap-1 text-sm"
                >
                  <Wallet size={14} /> Record Payment
                </button>
                <button
                  onClick={closeProfile}
                  className="text-gray-400 hover:text-gray-600 ml-2"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 border-b bg-white">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Total Purchased</div>
                <div className="text-lg font-bold text-gray-800">
                  {fmt(profileCustomer.total_purchased_amount)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Total Qty (KG)</div>
                <div className="text-lg font-bold text-gray-800">
                  {profileSales
                    .reduce(
                      (s, sale) =>
                        s +
                        sale.sale_items.reduce((si, item) => si + item.quantity_kg, 0),
                      0
                    )
                    .toLocaleString('en-IN', { maximumFractionDigits: 1 })}{' '}
                  KG
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Total Paid</div>
                <div className="text-lg font-bold text-green-700">
                  {fmt(profileCustomer.total_paid_amount)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Outstanding</div>
                <div
                  className={`text-lg font-bold ${
                    profileCustomer.total_purchased_amount - profileCustomer.total_paid_amount > 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}
                >
                  {fmt(
                    profileCustomer.total_purchased_amount - profileCustomer.total_paid_amount
                  )}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b bg-white px-5">
              {(
                [
                  { key: 'purchases', label: 'Purchase History', icon: FileText },
                  { key: 'payments', label: 'Payment History', icon: CreditCard },
                  { key: 'ledger', label: 'Ledger', icon: ArrowUpCircle },
                  { key: 'monthly', label: 'Monthly Summary', icon: BarChart2 },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setProfileTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    profileTab === key
                      ? 'border-primary-600 text-primary-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {profileLoading ? (
                <div className="text-center py-16 text-gray-400">Loading…</div>
              ) : (
                <>
                  {/* Purchase History */}
                  {profileTab === 'purchases' && (
                    <div>
                      {profileSales.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">No purchases yet.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="table-header">Invoice</th>
                                <th className="table-header">Date</th>
                                <th className="table-header">Items</th>
                                <th className="table-header text-right">Amount</th>
                                <th className="table-header text-right">Paid</th>
                                <th className="table-header text-right">Due</th>
                                <th className="table-header">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {profileSales.map((sale) => {
                                const due = sale.final_amount - sale.paid_amount
                                return (
                                  <tr key={sale.id} className="hover:bg-gray-50">
                                    <td className="table-cell font-mono text-xs text-gray-700">
                                      {sale.invoice_number}
                                    </td>
                                    <td className="table-cell text-gray-600">
                                      {format(parseISO(sale.sale_date), 'dd MMM yyyy')}
                                    </td>
                                    <td className="table-cell text-gray-600">
                                      {sale.sale_items.map((item) => (
                                        <div key={item.id}>
                                          {item.products?.name ?? 'Product'} —{' '}
                                          {item.quantity_kg} KG
                                        </div>
                                      ))}
                                    </td>
                                    <td className="table-cell text-right font-medium">
                                      {fmt(sale.final_amount)}
                                    </td>
                                    <td className="table-cell text-right text-green-700">
                                      {fmt(sale.paid_amount)}
                                    </td>
                                    <td className="table-cell text-right">
                                      {due > 0 ? (
                                        <span className="badge-red">{fmt(due)}</span>
                                      ) : (
                                        <span className="badge-green">৳0</span>
                                      )}
                                    </td>
                                    <td className="table-cell">
                                      {sale.delivery_status === 'delivered' ? (
                                        <span className="badge-green">Delivered</span>
                                      ) : sale.delivery_status === 'cancelled' ? (
                                        <span className="badge-red">Cancelled</span>
                                      ) : (
                                        <span className="badge-yellow">Pending</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payment History */}
                  {profileTab === 'payments' && (
                    <div>
                      {profilePayments.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">No payments yet.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="table-header">Date</th>
                                <th className="table-header">Method</th>
                                <th className="table-header text-right">Amount</th>
                                <th className="table-header">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {profilePayments.map((p) => (
                                <tr key={p.id} className="hover:bg-gray-50">
                                  <td className="table-cell text-gray-700">
                                    {format(parseISO(p.payment_date), 'dd MMM yyyy')}
                                  </td>
                                  <td className="table-cell">
                                    <span className="badge-blue">
                                      {paymentMethodLabel[p.payment_method]}
                                    </span>
                                  </td>
                                  <td className="table-cell text-right font-semibold text-green-700">
                                    {fmt(p.amount)}
                                  </td>
                                  <td className="table-cell text-gray-500 text-xs">
                                    {p.notes ?? '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ledger */}
                  {profileTab === 'ledger' && (
                    <div>
                      {profileSales.length === 0 && profilePayments.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">No ledger entries.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="table-header">Date</th>
                                <th className="table-header">Description</th>
                                <th className="table-header text-right">Debit (Sale)</th>
                                <th className="table-header text-right">Credit (Payment)</th>
                                <th className="table-header text-right">Balance</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {computeLedger().map((entry, idx) => (
                                <tr
                                  key={idx}
                                  className={`hover:bg-gray-50 ${
                                    entry.type === 'payment' ? 'bg-green-50/30' : ''
                                  }`}
                                >
                                  <td className="table-cell text-gray-600">
                                    {format(parseISO(entry.date), 'dd MMM yyyy')}
                                  </td>
                                  <td className="table-cell text-gray-700">
                                    <div className="flex items-center gap-2">
                                      {entry.type === 'purchase' ? (
                                        <ArrowUpCircle size={14} className="text-red-400" />
                                      ) : (
                                        <ArrowDownCircle size={14} className="text-green-500" />
                                      )}
                                      {entry.description}
                                    </div>
                                  </td>
                                  <td className="table-cell text-right text-red-600 font-medium">
                                    {entry.debit > 0 ? fmt(entry.debit) : '—'}
                                  </td>
                                  <td className="table-cell text-right text-green-700 font-medium">
                                    {entry.credit > 0 ? fmt(entry.credit) : '—'}
                                  </td>
                                  <td
                                    className={`table-cell text-right font-bold ${
                                      entry.balance > 0 ? 'text-red-600' : 'text-green-700'
                                    }`}
                                  >
                                    {fmt(entry.balance)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Monthly Summary */}
                  {profileTab === 'monthly' && (
                    <div>
                      {profileSales.length === 0 && profilePayments.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">No data yet.</div>
                      ) : (
                        <>
                          <div className="overflow-x-auto mb-6">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="table-header">Month</th>
                                  <th className="table-header text-right">Purchases</th>
                                  <th className="table-header text-right">Payments</th>
                                  <th className="table-header text-right">Net Due</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {computeMonthly().map((row) => (
                                  <tr key={row.month} className="hover:bg-gray-50">
                                    <td className="table-cell font-medium text-gray-800">
                                      {format(parseISO(row.month + '-01'), 'MMMM yyyy')}
                                    </td>
                                    <td className="table-cell text-right text-gray-800">
                                      {fmt(row.purchases)}
                                    </td>
                                    <td className="table-cell text-right text-green-700">
                                      {fmt(row.payments)}
                                    </td>
                                    <td
                                      className={`table-cell text-right font-semibold ${
                                        row.net > 0 ? 'text-red-600' : 'text-green-700'
                                      }`}
                                    >
                                      {fmt(row.net)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Mini bar chart */}
                          <div className="bg-gray-50 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                              <BarChart2 size={16} /> Monthly Trend (last 6 months)
                            </h3>
                            <div className="flex items-end gap-2 h-28">
                              {computeMonthly()
                                .slice(0, 6)
                                .reverse()
                                .map((row) => {
                                  const maxVal = Math.max(
                                    ...computeMonthly()
                                      .slice(0, 6)
                                      .map((r) => Math.max(r.purchases, r.payments))
                                  )
                                  const pctP = maxVal ? (row.purchases / maxVal) * 100 : 0
                                  const pctPay = maxVal ? (row.payments / maxVal) * 100 : 0
                                  return (
                                    <div
                                      key={row.month}
                                      className="flex-1 flex flex-col items-center gap-1"
                                    >
                                      <div className="w-full flex items-end gap-0.5 h-20">
                                        <div
                                          className="flex-1 bg-primary-400 rounded-t"
                                          style={{ height: `${pctP}%` }}
                                          title={`Purchases: ${fmt(row.purchases)}`}
                                        />
                                        <div
                                          className="flex-1 bg-green-400 rounded-t"
                                          style={{ height: `${pctPay}%` }}
                                          title={`Payments: ${fmt(row.payments)}`}
                                        />
                                      </div>
                                      <span className="text-[10px] text-gray-500">
                                        {format(parseISO(row.month + '-01'), 'MMM')}
                                      </span>
                                    </div>
                                  )
                                })}
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <span className="w-3 h-3 rounded-sm bg-primary-400 inline-block" />
                                Purchases
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="w-3 h-3 rounded-sm bg-green-400 inline-block" />
                                Payments
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          Record Payment Modal
      ════════════════════════════════════════════════════════════════════════════ */}
      {showPaymentModal && profileCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Record Payment</h2>
                <p className="text-sm text-gray-500">{profileCustomer.shop_name}</p>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                Outstanding Balance:{' '}
                <span className="font-bold">
                  {fmt(
                    profileCustomer.total_purchased_amount - profileCustomer.total_paid_amount
                  )}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (৳) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  className="input-field"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  required
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={paymentForm.payment_date}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, payment_date: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  className="input-field"
                  value={paymentForm.payment_method}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      payment_method: e.target.value as PaymentMethod,
                    })
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  className="input-field"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="Optional note…"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={paymentSaving} className="btn-primary">
                  {paymentSaving ? 'Saving…' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
