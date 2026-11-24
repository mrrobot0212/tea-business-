import { useState, useEffect, useCallback } from 'react'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Search,
  Filter,
  Plus,
  X,
  Calendar,
  CreditCard,
  Banknote,
  ArrowDownCircle,
  ArrowUpCircle,
  FileText,
} from 'lucide-react'
import { format, parseISO, startOfDay, endOfDay } from 'date-fns'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../lib/database.types'

// ── Types ────────────────────────────────────────────────────────────────────────
type Payment = Database['public']['Tables']['payments']['Row']
type SupplierPayment = Database['public']['Tables']['supplier_payments']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type Supplier = Database['public']['Tables']['suppliers']['Row']
type PaymentMethod = 'cash' | 'bkash' | 'nagad' | 'bank'
type ActiveTab = 'customer' | 'supplier'

interface CustomerPaymentRow extends Payment {
  customers: { shop_name: string } | null
}

interface SupplierPaymentRow extends SupplierPayment {
  suppliers: { name: string } | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  '৳' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  bank: 'Bank Transfer',
}

const paymentMethodBadge = (method: PaymentMethod) => {
  switch (method) {
    case 'cash':
      return 'badge-green'
    case 'bkash':
      return 'bg-pink-100 text-pink-700 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'
    case 'nagad':
      return 'bg-orange-100 text-orange-700 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'
    case 'bank':
      return 'bg-blue-100 text-blue-700 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'
  }
}

const todayStr = format(new Date(), 'yyyy-MM-dd')

// ── Component ────────────────────────────────────────────────────────────────────
export default function Payments() {
  const { partner } = useAuth()

  // ── Tab ────────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('customer')

  // ── Customer payments state ────────────────────────────────────────────────────
  const [customerPayments, setCustomerPayments] = useState<CustomerPaymentRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [cpLoading, setCpLoading] = useState(true)
  const [cpFilterCustomer, setCpFilterCustomer] = useState('all')
  const [cpFilterMethod, setCpFilterMethod] = useState<'all' | PaymentMethod>('all')
  const [cpFilterDateFrom, setCpFilterDateFrom] = useState('')
  const [cpFilterDateTo, setCpFilterDateTo] = useState('')
  const [cpSearch, setCpSearch] = useState('')

  // ── Supplier payments state ────────────────────────────────────────────────────
  const [supplierPayments, setSupplierPayments] = useState<SupplierPaymentRow[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [spLoading, setSpLoading] = useState(true)
  const [spFilterSupplier, setSpFilterSupplier] = useState('all')
  const [spFilterMethod, setSpFilterMethod] = useState<'all' | PaymentMethod>('all')
  const [spFilterDateFrom, setSpFilterDateFrom] = useState('')
  const [spFilterDateTo, setSpFilterDateTo] = useState('')
  const [spSearch, setSpSearch] = useState('')

  // ── Customer Payment Modal ─────────────────────────────────────────────────────
  const [showCpModal, setShowCpModal] = useState(false)
  const [cpForm, setCpForm] = useState({
    customer_id: '',
    amount: '',
    payment_date: todayStr,
    payment_method: 'cash' as PaymentMethod,
    notes: '',
  })
  const [cpSaving, setCpSaving] = useState(false)

  // ── Supplier Payment Modal ─────────────────────────────────────────────────────
  const [showSpModal, setShowSpModal] = useState(false)
  const [spForm, setSpForm] = useState({
    supplier_id: '',
    amount: '',
    payment_date: todayStr,
    payment_method: 'cash' as PaymentMethod,
    notes: '',
  })
  const [spSaving, setSpSaving] = useState(false)

  // ══════════════════════════════════════════════════════════════════════════════
  //  FETCH DATA
  // ══════════════════════════════════════════════════════════════════════════════

  const fetchCustomerPayments = useCallback(async () => {
    setCpLoading(true)
    const [{ data: payments, error: pErr }, { data: custs, error: cErr }] = await Promise.all([
      supabase
        .from('payments')
        .select('*, customers(shop_name)')
        .order('payment_date', { ascending: false }),
      supabase.from('customers').select('*').order('shop_name', { ascending: true }),
    ])
    if (pErr) toast.error('Failed to load customer payments')
    if (cErr) toast.error('Failed to load customers')
    setCustomerPayments((payments as CustomerPaymentRow[]) ?? [])
    setCustomers(custs ?? [])
    setCpLoading(false)
  }, [])

  const fetchSupplierPayments = useCallback(async () => {
    setSpLoading(true)
    const [{ data: payments, error: pErr }, { data: supps, error: sErr }] = await Promise.all([
      supabase
        .from('supplier_payments')
        .select('*, suppliers(name)')
        .order('payment_date', { ascending: false }),
      supabase.from('suppliers').select('*').order('name', { ascending: true }),
    ])
    if (pErr) toast.error('Failed to load supplier payments')
    if (sErr) toast.error('Failed to load suppliers')
    setSupplierPayments((payments as SupplierPaymentRow[]) ?? [])
    setSuppliers(supps ?? [])
    setSpLoading(false)
  }, [])

  useEffect(() => {
    fetchCustomerPayments()
    fetchSupplierPayments()
  }, [fetchCustomerPayments, fetchSupplierPayments])

  // ══════════════════════════════════════════════════════════════════════════════
  //  CUSTOMER PAYMENT SUMMARIES & FILTERING
  // ══════════════════════════════════════════════════════════════════════════════

  const cpTotalCollected = customerPayments.reduce((s, p) => s + p.amount, 0)
  const cpTodayCollection = customerPayments
    .filter((p) => p.payment_date === todayStr)
    .reduce((s, p) => s + p.amount, 0)
  const cpTotalCustomerDues = customers.reduce(
    (s, c) => s + Math.max(0, c.total_purchased_amount - c.total_paid_amount),
    0
  )

  const filteredCp = customerPayments.filter((p) => {
    const q = cpSearch.toLowerCase()
    const shopName = p.customers?.shop_name ?? ''
    const matchSearch =
      !q ||
      shopName.toLowerCase().includes(q) ||
      (p.notes ?? '').toLowerCase().includes(q)
    const matchCustomer = cpFilterCustomer === 'all' || p.customer_id === cpFilterCustomer
    const matchMethod = cpFilterMethod === 'all' || p.payment_method === cpFilterMethod
    const matchDateFrom = !cpFilterDateFrom || p.payment_date >= cpFilterDateFrom
    const matchDateTo = !cpFilterDateTo || p.payment_date <= cpFilterDateTo
    return matchSearch && matchCustomer && matchMethod && matchDateFrom && matchDateTo
  })

  // ══════════════════════════════════════════════════════════════════════════════
  //  SUPPLIER PAYMENT SUMMARIES & FILTERING
  // ══════════════════════════════════════════════════════════════════════════════

  const spTotalPaid = supplierPayments.reduce((s, p) => s + p.amount, 0)
  const spTodayPayments = supplierPayments
    .filter((p) => p.payment_date === todayStr)
    .reduce((s, p) => s + p.amount, 0)
  const spTotalSupplierDues = suppliers.reduce(
    (s, sup) => s + Math.max(0, sup.total_purchased - sup.total_paid),
    0
  )

  const filteredSp = supplierPayments.filter((p) => {
    const q = spSearch.toLowerCase()
    const supplierName = p.suppliers?.name ?? ''
    const matchSearch =
      !q ||
      supplierName.toLowerCase().includes(q) ||
      (p.notes ?? '').toLowerCase().includes(q)
    const matchSupplier = spFilterSupplier === 'all' || p.supplier_id === spFilterSupplier
    const matchMethod = spFilterMethod === 'all' || p.payment_method === spFilterMethod
    const matchDateFrom = !spFilterDateFrom || p.payment_date >= spFilterDateFrom
    const matchDateTo = !spFilterDateTo || p.payment_date <= spFilterDateTo
    return matchSearch && matchSupplier && matchMethod && matchDateFrom && matchDateTo
  })

  // ══════════════════════════════════════════════════════════════════════════════
  //  RECORD CUSTOMER PAYMENT
  // ══════════════════════════════════════════════════════════════════════════════

  const openCpModal = () => {
    setCpForm({
      customer_id: '',
      amount: '',
      payment_date: todayStr,
      payment_method: 'cash',
      notes: '',
    })
    setShowCpModal(true)
  }

  const handleRecordCustomerPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partner) return
    setCpSaving(true)
    try {
      const amount = parseFloat(cpForm.amount)
      if (isNaN(amount) || amount <= 0) throw new Error('Enter a valid amount')
      if (!cpForm.customer_id) throw new Error('Select a customer')

      const { error } = await supabase.from('payments').insert({
        customer_id: cpForm.customer_id,
        amount,
        payment_date: cpForm.payment_date,
        payment_method: cpForm.payment_method,
        notes: cpForm.notes || null,
        created_by: partner.id,
      })
      if (error) throw error

      // Update customer totals
      const customer = customers.find((c) => c.id === cpForm.customer_id)
      if (customer) {
        await supabase
          .from('customers')
          .update({
            total_paid_amount: customer.total_paid_amount + amount,
            last_payment_date: cpForm.payment_date,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cpForm.customer_id)
      }

      toast.success('Customer payment recorded')
      setShowCpModal(false)
      fetchCustomerPayments()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to record payment')
    } finally {
      setCpSaving(false)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  RECORD SUPPLIER PAYMENT
  // ══════════════════════════════════════════════════════════════════════════════

  const openSpModal = () => {
    setSpForm({
      supplier_id: '',
      amount: '',
      payment_date: todayStr,
      payment_method: 'cash',
      notes: '',
    })
    setShowSpModal(true)
  }

  const handleRecordSupplierPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partner) return
    setSpSaving(true)
    try {
      const amount = parseFloat(spForm.amount)
      if (isNaN(amount) || amount <= 0) throw new Error('Enter a valid amount')
      if (!spForm.supplier_id) throw new Error('Select a supplier')

      const { error } = await supabase.from('supplier_payments').insert({
        supplier_id: spForm.supplier_id,
        amount,
        payment_date: spForm.payment_date,
        payment_method: spForm.payment_method,
        notes: spForm.notes || null,
        created_by: partner.id,
      })
      if (error) throw error

      // Update supplier totals
      const supplier = suppliers.find((s) => s.id === spForm.supplier_id)
      if (supplier) {
        await supabase
          .from('suppliers')
          .update({
            total_paid: supplier.total_paid + amount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', spForm.supplier_id)
      }

      toast.success('Supplier payment recorded')
      setShowSpModal(false)
      fetchSupplierPayments()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to record payment')
    } finally {
      setSpSaving(false)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">Record and track all customer & supplier payments</p>
        </div>
        <button
          onClick={activeTab === 'customer' ? openCpModal : openSpModal}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Record Payment
        </button>
      </div>

      {/* ── Tab Buttons ── */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('customer')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === 'customer'
              ? 'bg-primary-700 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <ArrowDownCircle size={16} /> Customer Payments
        </button>
        <button
          onClick={() => setActiveTab('supplier')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === 'supplier'
              ? 'bg-primary-700 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <ArrowUpCircle size={16} /> Supplier Payments
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          CUSTOMER PAYMENTS TAB
      ════════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'customer' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">Total Collected</span>
                <Wallet size={20} className="text-green-500" />
              </div>
              <div className="text-xl font-bold text-green-700">{fmt(cpTotalCollected)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">Today's Collection</span>
                <TrendingUp size={20} className="text-blue-500" />
              </div>
              <div className="text-xl font-bold text-gray-800">{fmt(cpTodayCollection)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">Total Customer Dues</span>
                <AlertCircle size={20} className="text-red-500" />
              </div>
              <div className="text-xl font-bold text-red-600">{fmt(cpTotalCustomerDues)}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="card">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="input-field pl-9"
                  placeholder="Search customer, notes…"
                  value={cpSearch}
                  onChange={(e) => setCpSearch(e.target.value)}
                />
              </div>
              <select
                className="input-field w-full md:w-48"
                value={cpFilterCustomer}
                onChange={(e) => setCpFilterCustomer(e.target.value)}
              >
                <option value="all">All Customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.shop_name}
                  </option>
                ))}
              </select>
              <select
                className="input-field w-full md:w-40"
                value={cpFilterMethod}
                onChange={(e) => setCpFilterMethod(e.target.value as typeof cpFilterMethod)}
              >
                <option value="all">All Methods</option>
                <option value="cash">Cash</option>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="bank">Bank Transfer</option>
              </select>
              <input
                type="date"
                className="input-field w-full md:w-40"
                value={cpFilterDateFrom}
                onChange={(e) => setCpFilterDateFrom(e.target.value)}
                placeholder="From"
                title="From date"
              />
              <input
                type="date"
                className="input-field w-full md:w-40"
                value={cpFilterDateTo}
                onChange={(e) => setCpFilterDateTo(e.target.value)}
                placeholder="To"
                title="To date"
              />
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden p-0">
            {cpLoading ? (
              <div className="p-12 text-center text-gray-500">Loading payments…</div>
            ) : filteredCp.length === 0 ? (
              <div className="p-12 text-center text-gray-400">No customer payments found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="table-header">Date</th>
                      <th className="table-header">Customer</th>
                      <th className="table-header text-right">Amount</th>
                      <th className="table-header">Payment Method</th>
                      <th className="table-header">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCp.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell text-gray-700">
                          {format(parseISO(p.payment_date), 'dd MMM yyyy')}
                        </td>
                        <td className="table-cell font-medium text-gray-900">
                          {p.customers?.shop_name ?? '—'}
                        </td>
                        <td className="table-cell text-right font-semibold text-green-700">
                          {fmt(p.amount)}
                        </td>
                        <td className="table-cell">
                          <span className={paymentMethodBadge(p.payment_method)}>
                            {paymentMethodLabel[p.payment_method]}
                          </span>
                        </td>
                        <td className="table-cell text-gray-500 text-xs max-w-[200px] truncate">
                          {p.notes ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SUPPLIER PAYMENTS TAB
      ════════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'supplier' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">Total Paid to Suppliers</span>
                <Banknote size={20} className="text-primary-600" />
              </div>
              <div className="text-xl font-bold text-gray-800">{fmt(spTotalPaid)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">Today's Payments</span>
                <TrendingDown size={20} className="text-orange-500" />
              </div>
              <div className="text-xl font-bold text-gray-800">{fmt(spTodayPayments)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">Total Supplier Dues</span>
                <AlertCircle size={20} className="text-red-500" />
              </div>
              <div className="text-xl font-bold text-red-600">{fmt(spTotalSupplierDues)}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="card">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="input-field pl-9"
                  placeholder="Search supplier, notes…"
                  value={spSearch}
                  onChange={(e) => setSpSearch(e.target.value)}
                />
              </div>
              <select
                className="input-field w-full md:w-48"
                value={spFilterSupplier}
                onChange={(e) => setSpFilterSupplier(e.target.value)}
              >
                <option value="all">All Suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                className="input-field w-full md:w-40"
                value={spFilterMethod}
                onChange={(e) => setSpFilterMethod(e.target.value as typeof spFilterMethod)}
              >
                <option value="all">All Methods</option>
                <option value="cash">Cash</option>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="bank">Bank Transfer</option>
              </select>
              <input
                type="date"
                className="input-field w-full md:w-40"
                value={spFilterDateFrom}
                onChange={(e) => setSpFilterDateFrom(e.target.value)}
                title="From date"
              />
              <input
                type="date"
                className="input-field w-full md:w-40"
                value={spFilterDateTo}
                onChange={(e) => setSpFilterDateTo(e.target.value)}
                title="To date"
              />
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden p-0">
            {spLoading ? (
              <div className="p-12 text-center text-gray-500">Loading payments…</div>
            ) : filteredSp.length === 0 ? (
              <div className="p-12 text-center text-gray-400">No supplier payments found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="table-header">Date</th>
                      <th className="table-header">Supplier</th>
                      <th className="table-header text-right">Amount</th>
                      <th className="table-header">Payment Method</th>
                      <th className="table-header">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredSp.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell text-gray-700">
                          {format(parseISO(p.payment_date), 'dd MMM yyyy')}
                        </td>
                        <td className="table-cell font-medium text-gray-900">
                          {p.suppliers?.name ?? '—'}
                        </td>
                        <td className="table-cell text-right font-semibold text-gray-800">
                          {fmt(p.amount)}
                        </td>
                        <td className="table-cell">
                          <span className={paymentMethodBadge(p.payment_method)}>
                            {paymentMethodLabel[p.payment_method]}
                          </span>
                        </td>
                        <td className="table-cell text-gray-500 text-xs max-w-[200px] truncate">
                          {p.notes ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          RECORD CUSTOMER PAYMENT MODAL
      ════════════════════════════════════════════════════════════════════════════ */}
      {showCpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Record Customer Payment</h2>
                <p className="text-sm text-gray-500">Money received from customer</p>
              </div>
              <button onClick={() => setShowCpModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRecordCustomerPayment} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer <span className="text-red-500">*</span>
                </label>
                <select
                  className="input-field"
                  value={cpForm.customer_id}
                  onChange={(e) => setCpForm({ ...cpForm, customer_id: e.target.value })}
                  required
                >
                  <option value="">Select customer…</option>
                  {customers.map((c) => {
                    const due = Math.max(0, c.total_purchased_amount - c.total_paid_amount)
                    return (
                      <option key={c.id} value={c.id}>
                        {c.shop_name} — Due: {fmt(due)}
                      </option>
                    )
                  })}
                </select>
              </div>
              {cpForm.customer_id && (() => {
                const selected = customers.find((c) => c.id === cpForm.customer_id)
                if (!selected) return null
                const due = Math.max(0, selected.total_purchased_amount - selected.total_paid_amount)
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                    Outstanding Balance: <span className="font-bold">{fmt(due)}</span>
                  </div>
                )
              })()}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (৳) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  className="input-field"
                  value={cpForm.amount}
                  onChange={(e) => setCpForm({ ...cpForm, amount: e.target.value })}
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
                  value={cpForm.payment_date}
                  onChange={(e) => setCpForm({ ...cpForm, payment_date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  className="input-field"
                  value={cpForm.payment_method}
                  onChange={(e) =>
                    setCpForm({ ...cpForm, payment_method: e.target.value as PaymentMethod })
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
                  value={cpForm.notes}
                  onChange={(e) => setCpForm({ ...cpForm, notes: e.target.value })}
                  placeholder="Optional note…"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCpModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={cpSaving} className="btn-primary">
                  {cpSaving ? 'Saving…' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          RECORD SUPPLIER PAYMENT MODAL
      ════════════════════════════════════════════════════════════════════════════ */}
      {showSpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Record Supplier Payment</h2>
                <p className="text-sm text-gray-500">Money paid to supplier</p>
              </div>
              <button onClick={() => setShowSpModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRecordSupplierPayment} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier <span className="text-red-500">*</span>
                </label>
                <select
                  className="input-field"
                  value={spForm.supplier_id}
                  onChange={(e) => setSpForm({ ...spForm, supplier_id: e.target.value })}
                  required
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => {
                    const due = Math.max(0, s.total_purchased - s.total_paid)
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} — Due: {fmt(due)}
                      </option>
                    )
                  })}
                </select>
              </div>
              {spForm.supplier_id && (() => {
                const selected = suppliers.find((s) => s.id === spForm.supplier_id)
                if (!selected) return null
                const due = Math.max(0, selected.total_purchased - selected.total_paid)
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                    Outstanding Balance: <span className="font-bold">{fmt(due)}</span>
                  </div>
                )
              })()}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (৳) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  className="input-field"
                  value={spForm.amount}
                  onChange={(e) => setSpForm({ ...spForm, amount: e.target.value })}
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
                  value={spForm.payment_date}
                  onChange={(e) => setSpForm({ ...spForm, payment_date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  className="input-field"
                  value={spForm.payment_method}
                  onChange={(e) =>
                    setSpForm({ ...spForm, payment_method: e.target.value as PaymentMethod })
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
                  value={spForm.notes}
                  onChange={(e) => setSpForm({ ...spForm, notes: e.target.value })}
                  placeholder="Optional note…"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSpModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={spSaving} className="btn-primary">
                  {spSaving ? 'Saving…' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
