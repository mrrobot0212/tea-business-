import { useState, useEffect, useCallback } from 'react'
import {
  Package,
  Layers,
  AlertTriangle,
  ArrowDownUp,
  Search,
  Filter,
  Plus,
  Minus,
  X,
  TrendingUp,
  TrendingDown,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../lib/database.types'

type Product = Database['public']['Tables']['products']['Row']
type InventoryMovement = Database['public']['Tables']['inventory_movements']['Row']

type MovementWithProduct = InventoryMovement & {
  products: { name: string } | null
}

type StockStatus = 'all' | 'ok' | 'low' | 'critical'
type AdjustmentType = 'add' | 'subtract' | 'damaged'

interface AdjustmentForm {
  product_id: string
  type: AdjustmentType
  quantity: string
  notes: string
}

const EMPTY_ADJUSTMENT: AdjustmentForm = {
  product_id: '',
  type: 'add',
  quantity: '',
  notes: '',
}

const fmt = (n: number) =>
  '৳' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const fmtKg = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 3 })

const getStockStatus = (current: number, minimum: number): 'ok' | 'low' | 'critical' => {
  if (current <= 0) return 'critical'
  if (current <= minimum) return 'low'
  return 'ok'
}

const movementTypeLabel: Record<string, string> = {
  purchase: 'Purchase',
  sale: 'Sale',
  adjustment: 'Adjustment',
  damaged: 'Damaged',
}

export default function Inventory() {
  const { partner } = useAuth()

  // ── List state ──────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<MovementWithProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [movementsLoading, setMovementsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<StockStatus>('all')

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustForm, setAdjustForm] = useState<AdjustmentForm>(EMPTY_ADJUSTMENT)
  const [saving, setSaving] = useState(false)

  // ── Summary cards data ───────────────────────────────────────────────────────
  const totalProducts = products.length
  const totalStockKg = products.reduce((s, p) => s + (p.current_stock_kg ?? 0), 0)
  const lowStockItems = products.filter((p) => {
    const status = getStockStatus(p.current_stock_kg ?? 0, p.minimum_stock_kg ?? 0)
    return status === 'low' || status === 'critical'
  }).length
  const recentMovementsCount = movements.length

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (error) {
      toast.error('Failed to load products')
    } else {
      setProducts(data ?? [])
    }
    setLoading(false)
  }, [])

  const fetchMovements = useCallback(async () => {
    setMovementsLoading(true)
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*, products(name)')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      toast.error('Failed to load inventory movements')
    } else {
      setMovements((data as MovementWithProduct[]) ?? [])
    }
    setMovementsLoading(false)
  }, [])

  useEffect(() => {
    fetchProducts()
    fetchMovements()
  }, [fetchProducts, fetchMovements])

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? '').toLowerCase().includes(q) ||
      (p.brand_name ?? '').toLowerCase().includes(q)
    const status = getStockStatus(p.current_stock_kg ?? 0, p.minimum_stock_kg ?? 0)
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'ok' && status === 'ok') ||
      (filterStatus === 'low' && status === 'low') ||
      (filterStatus === 'critical' && status === 'critical')
    return matchSearch && matchStatus
  })

  // ── Adjust stock handler ─────────────────────────────────────────────────────
  const openAdjustModal = () => {
    setAdjustForm(EMPTY_ADJUSTMENT)
    setShowAdjustModal(true)
  }

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partner) return
    setSaving(true)
    try {
      const quantity = parseFloat(adjustForm.quantity)
      if (isNaN(quantity) || quantity <= 0) throw new Error('Enter a valid quantity')
      if (!adjustForm.product_id) throw new Error('Select a product')

      const selectedProduct = products.find((p) => p.id === adjustForm.product_id)
      if (!selectedProduct) throw new Error('Product not found')

      // Determine movement type and signed quantity
      let movementType: string
      let signedQuantity: number

      if (adjustForm.type === 'add') {
        movementType = 'adjustment'
        signedQuantity = quantity
      } else if (adjustForm.type === 'subtract') {
        movementType = 'adjustment'
        signedQuantity = -quantity
      } else {
        // damaged
        movementType = 'damaged'
        signedQuantity = -quantity
      }

      // Validate we don't go negative on subtract/damaged
      if (signedQuantity < 0) {
        const newStock = (selectedProduct.current_stock_kg ?? 0) + signedQuantity
        if (newStock < 0) {
          throw new Error(
            `Insufficient stock. Current: ${fmtKg(selectedProduct.current_stock_kg ?? 0)} KG`
          )
        }
      }

      // Insert inventory movement
      const { error: moveError } = await supabase.from('inventory_movements').insert({
        product_id: adjustForm.product_id,
        movement_type: movementType,
        quantity_kg: signedQuantity,
        notes: adjustForm.notes || null,
        created_by: partner.id,
      })
      if (moveError) throw moveError

      // Update product stock
      const newStockKg = (selectedProduct.current_stock_kg ?? 0) + signedQuantity
      const { error: updateError } = await supabase
        .from('products')
        .update({
          current_stock_kg: newStockKg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', adjustForm.product_id)
      if (updateError) throw updateError

      const actionLabel =
        adjustForm.type === 'add' ? 'added to' : adjustForm.type === 'subtract' ? 'removed from' : 'marked damaged in'
      toast.success(`${fmtKg(quantity)} KG ${actionLabel} ${selectedProduct.name}`)
      setShowAdjustModal(false)
      fetchProducts()
      fetchMovements()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to adjust stock')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Inventory Management</h1>
          <p className="page-subtitle">Monitor stock levels and manage inventory adjustments</p>
        </div>
        <button onClick={openAdjustModal} className="btn-primary flex items-center gap-2">
          <ArrowDownUp size={18} /> Adjust Stock
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Products</span>
            <Package size={20} className="text-primary-600" />
          </div>
          <div className="text-2xl font-bold text-gray-800">{totalProducts}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Stock</span>
            <Layers size={20} className="text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-gray-800">{fmtKg(totalStockKg)} KG</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Low Stock Items</span>
            <AlertTriangle size={20} className="text-yellow-500" />
          </div>
          <div className={`text-2xl font-bold ${lowStockItems > 0 ? 'text-red-600' : 'text-gray-800'}`}>
            {lowStockItems}
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Recent Movements</span>
            <ArrowDownUp size={20} className="text-green-500" />
          </div>
          <div className="text-2xl font-bold text-gray-800">{recentMovementsCount}</div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="card">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input-field pl-9"
              placeholder="Search product name, SKU, brand…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input-field w-full md:w-44"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as StockStatus)}
          >
            <option value="all">All Stock Status</option>
            <option value="ok">OK</option>
            <option value="low">Low Stock</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* ── Products Table ── */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading products…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No products found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="table-header">Product Name</th>
                  <th className="table-header">SKU</th>
                  <th className="table-header text-right">Current Stock (KG)</th>
                  <th className="table-header text-right">Min Stock (KG)</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Cost Price</th>
                  <th className="table-header text-right">Sell Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => {
                  const currentStock = p.current_stock_kg ?? 0
                  const minStock = p.minimum_stock_kg ?? 0
                  const status = getStockStatus(currentStock, minStock)
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <div>
                          <div className="font-medium text-gray-900">{p.name}</div>
                          {p.brand_name && (
                            <div className="text-xs text-gray-500">{p.brand_name}</div>
                          )}
                        </div>
                      </td>
                      <td className="table-cell font-mono text-xs text-gray-600">
                        {p.sku ?? '—'}
                      </td>
                      <td className="table-cell text-right font-medium">
                        <span
                          className={
                            status === 'critical'
                              ? 'text-red-600'
                              : status === 'low'
                              ? 'text-yellow-600'
                              : 'text-gray-800'
                          }
                        >
                          {fmtKg(currentStock)}
                        </span>
                      </td>
                      <td className="table-cell text-right text-gray-500">
                        {fmtKg(minStock)}
                      </td>
                      <td className="table-cell">
                        {status === 'ok' && <span className="badge-green">OK</span>}
                        {status === 'low' && <span className="badge-yellow">Low</span>}
                        {status === 'critical' && <span className="badge-red">Critical</span>}
                      </td>
                      <td className="table-cell text-right text-gray-700">
                        {fmt(p.purchase_price_per_kg ?? 0)}
                      </td>
                      <td className="table-cell text-right text-gray-700">
                        {fmt(p.selling_price_per_kg ?? 0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Recent Inventory Movements ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Inventory Movement History</h2>
            <p className="text-sm text-gray-500">Last 50 stock movements</p>
          </div>
          <button
            onClick={() => {
              fetchMovements()
              toast.success('Movements refreshed')
            }}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div className="card overflow-hidden p-0">
          {movementsLoading ? (
            <div className="p-12 text-center text-gray-500">Loading movements…</div>
          ) : movements.length === 0 ? (
            <div className="p-12 text-center text-gray-400">No inventory movements yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="table-header">Date</th>
                    <th className="table-header">Product</th>
                    <th className="table-header">Type</th>
                    <th className="table-header text-right">Quantity (KG)</th>
                    <th className="table-header">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {movements.map((m) => {
                    const qty = m.quantity_kg ?? 0
                    const isPositive = qty > 0
                    return (
                      <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell text-gray-600 text-sm">
                          {m.created_at
                            ? format(parseISO(m.created_at), 'dd MMM yyyy, hh:mm a')
                            : '—'}
                        </td>
                        <td className="table-cell font-medium text-gray-900">
                          {m.products?.name ?? 'Unknown Product'}
                        </td>
                        <td className="table-cell">
                          {m.movement_type === 'purchase' && (
                            <span className="badge-green">Purchase</span>
                          )}
                          {m.movement_type === 'sale' && (
                            <span className="badge-blue">Sale</span>
                          )}
                          {m.movement_type === 'adjustment' && (
                            <span className="badge-yellow">Adjustment</span>
                          )}
                          {m.movement_type === 'damaged' && (
                            <span className="badge-red">Damaged</span>
                          )}
                        </td>
                        <td className="table-cell text-right font-medium">
                          <span
                            className={`flex items-center justify-end gap-1 ${
                              isPositive ? 'text-green-700' : 'text-red-600'
                            }`}
                          >
                            {isPositive ? (
                              <ArrowUpCircle size={14} className="text-green-500" />
                            ) : (
                              <ArrowDownCircle size={14} className="text-red-400" />
                            )}
                            {isPositive ? '+' : ''}
                            {fmtKg(qty)}
                          </span>
                        </td>
                        <td className="table-cell text-gray-500 text-xs">
                          {m.notes ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          Adjust Stock Modal
      ════════════════════════════════════════════════════════════════════════════ */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Adjust Stock</h2>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAdjustStock} className="p-5 space-y-4">
              {/* Product select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product <span className="text-red-500">*</span>
                </label>
                <select
                  className="input-field"
                  value={adjustForm.product_id}
                  onChange={(e) => setAdjustForm({ ...adjustForm, product_id: e.target.value })}
                  required
                >
                  <option value="">Select a product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(${p.sku})` : ''} — {fmtKg(p.current_stock_kg ?? 0)} KG
                    </option>
                  ))}
                </select>
              </div>

              {/* Show current stock info */}
              {adjustForm.product_id && (() => {
                const selected = products.find((p) => p.id === adjustForm.product_id)
                if (!selected) return null
                const currentStock = selected.current_stock_kg ?? 0
                const minStock = selected.minimum_stock_kg ?? 0
                const status = getStockStatus(currentStock, minStock)
                return (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Current Stock:</span>
                      <span className="font-semibold text-gray-800">{fmtKg(currentStock)} KG</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-gray-600">Min Stock:</span>
                      <span className="text-gray-600">{fmtKg(minStock)} KG</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-gray-600">Status:</span>
                      {status === 'ok' && <span className="badge-green">OK</span>}
                      {status === 'low' && <span className="badge-yellow">Low</span>}
                      {status === 'critical' && <span className="badge-red">Critical</span>}
                    </div>
                  </div>
                )
              })()}

              {/* Adjustment type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adjustment Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'add', label: 'Add Stock', icon: Plus, color: 'green' },
                    { value: 'subtract', label: 'Remove', icon: Minus, color: 'yellow' },
                    { value: 'damaged', label: 'Damaged', icon: Trash2, color: 'red' },
                  ] as const).map(({ value, label, icon: Icon, color }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAdjustForm({ ...adjustForm, type: value })}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                        adjustForm.type === value
                          ? color === 'green'
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : color === 'yellow'
                            ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                            : 'border-red-500 bg-red-50 text-red-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Icon size={15} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity (KG) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  className="input-field"
                  value={adjustForm.quantity}
                  onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                  required
                  placeholder="0.000"
                />
              </div>

              {/* Preview new stock */}
              {adjustForm.product_id && adjustForm.quantity && (() => {
                const selected = products.find((p) => p.id === adjustForm.product_id)
                if (!selected) return null
                const currentStock = selected.current_stock_kg ?? 0
                const qty = parseFloat(adjustForm.quantity)
                if (isNaN(qty) || qty <= 0) return null
                const newStock = adjustForm.type === 'add'
                  ? currentStock + qty
                  : currentStock - qty
                return (
                  <div className={`rounded-lg p-3 text-sm border ${
                    newStock < 0
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}>
                    New stock after adjustment:{' '}
                    <span className="font-bold">{fmtKg(newStock)} KG</span>
                    {newStock < 0 && (
                      <span className="block text-xs mt-1 text-red-600">
                        ⚠ Stock will go negative — adjustment will be rejected
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason / Notes
                </label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                  placeholder="Reason for adjustment…"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving…' : 'Save Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
