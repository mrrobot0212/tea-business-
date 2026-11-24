import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, Search, Edit2, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight,
  Package, Tag, AlertTriangle, X, Loader2, Layers
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../lib/database.types'

type Product = Database['public']['Tables']['products']['Row']
type TeaGrade = Database['public']['Tables']['tea_grades']['Row']

type ProductWithGrade = Product & { tea_grades: { name: string } | null }

interface ProductFormData {
  name: string
  brand_name: string
  sku: string
  tea_grade_id: string
  purchase_price_per_kg: string
  selling_price_per_kg: string
  minimum_stock_kg: string
  description: string
}

const EMPTY_FORM: ProductFormData = {
  name: '',
  brand_name: '',
  sku: '',
  tea_grade_id: '',
  purchase_price_per_kg: '',
  selling_price_per_kg: '',
  minimum_stock_kg: '10',
  description: '',
}

const PAGE_SIZE = 10

function generateSKU(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.slice(0, 3))
    .join('-')
    .slice(0, 15)
}

// ─── Product Modal ────────────────────────────────────────────────────────────
interface ProductModalProps {
  product: ProductWithGrade | null
  grades: TeaGrade[]
  onClose: () => void
  onSaved: () => void
  partnerId: string
}

function ProductModal({ product, grades, onClose, onSaved, partnerId }: ProductModalProps) {
  const isEdit = !!product
  const [form, setForm] = useState<ProductFormData>(() =>
    isEdit
      ? {
          name: product.name,
          brand_name: product.brand_name ?? '',
          sku: product.sku,
          tea_grade_id: product.tea_grade_id,
          purchase_price_per_kg: String(product.purchase_price_per_kg),
          selling_price_per_kg: String(product.selling_price_per_kg),
          minimum_stock_kg: String(product.minimum_stock_kg),
          description: product.description ?? '',
        }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<ProductFormData>>({})

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm(prev => {
      const updated = { ...prev, [name]: value }
      if (name === 'name' && !isEdit) {
        updated.sku = generateSKU(value)
      }
      return updated
    })
    setErrors(prev => ({ ...prev, [name]: '' }))
  }

  function validate(): boolean {
    const e: Partial<ProductFormData> = {}
    if (!form.name.trim()) e.name = 'Product name is required'
    if (!form.sku.trim()) e.sku = 'SKU is required'
    if (!form.tea_grade_id) e.tea_grade_id = 'Tea grade is required'
    if (!form.purchase_price_per_kg || Number(form.purchase_price_per_kg) <= 0)
      e.purchase_price_per_kg = 'Valid purchase price required'
    if (!form.selling_price_per_kg || Number(form.selling_price_per_kg) <= 0)
      e.selling_price_per_kg = 'Valid selling price required'
    if (!form.minimum_stock_kg || Number(form.minimum_stock_kg) < 0)
      e.minimum_stock_kg = 'Valid minimum stock required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        brand_name: form.brand_name.trim() || null,
        sku: form.sku.trim().toUpperCase(),
        tea_grade_id: form.tea_grade_id,
        purchase_price_per_kg: Number(form.purchase_price_per_kg),
        selling_price_per_kg: Number(form.selling_price_per_kg),
        minimum_stock_kg: Number(form.minimum_stock_kg),
        description: form.description.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (isEdit) {
        const { error } = await supabase.from('products').update(payload).eq('id', product.id)
        if (error) throw error
        toast.success('Product updated successfully')
      } else {
        const { error } = await supabase.from('products').insert({
          ...payload,
          created_by: partnerId,
          is_active: true,
        })
        if (error) throw error
        toast.success('Product added successfully')
      }
      onSaved()
      onClose()
    } catch (err: any) {
      if (err?.code === '23505') {
        toast.error('A product with this SKU already exists')
        setErrors(prev => ({ ...prev, sku: 'SKU already exists' }))
      } else {
        toast.error(err?.message ?? 'Failed to save product')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-50 rounded-lg">
              <Package className="w-5 h-5 text-primary-700" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isEdit ? 'Edit Product' : 'Add New Product'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Row 1: Name + Brand */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Premium Assam CTC"
                className={`input-field ${errors.name ? 'border-red-400 focus:ring-red-400' : ''}`}
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
              <input
                name="brand_name"
                value={form.brand_name}
                onChange={handleChange}
                placeholder="e.g. Ispahani"
                className="input-field"
              />
            </div>
          </div>

          {/* Row 2: SKU + Grade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                name="sku"
                value={form.sku}
                onChange={handleChange}
                placeholder="e.g. PRE-ASS-CTC"
                className={`input-field font-mono ${errors.sku ? 'border-red-400 focus:ring-red-400' : ''}`}
              />
              {errors.sku ? (
                <p className="text-xs text-red-500 mt-1">{errors.sku}</p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Auto-generated from name, editable</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tea Grade <span className="text-red-500">*</span>
              </label>
              <select
                name="tea_grade_id"
                value={form.tea_grade_id}
                onChange={handleChange}
                className={`input-field ${errors.tea_grade_id ? 'border-red-400 focus:ring-red-400' : ''}`}
              >
                <option value="">Select grade...</option>
                {grades.filter(g => g.is_active).map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {errors.tea_grade_id && <p className="text-xs text-red-500 mt-1">{errors.tea_grade_id}</p>}
            </div>
          </div>

          {/* Row 3: Prices */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Purchase Price / KG (৳) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="purchase_price_per_kg"
                value={form.purchase_price_per_kg}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder="0.00"
                className={`input-field ${errors.purchase_price_per_kg ? 'border-red-400 focus:ring-red-400' : ''}`}
              />
              {errors.purchase_price_per_kg && (
                <p className="text-xs text-red-500 mt-1">{errors.purchase_price_per_kg}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Selling Price / KG (৳) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="selling_price_per_kg"
                value={form.selling_price_per_kg}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder="0.00"
                className={`input-field ${errors.selling_price_per_kg ? 'border-red-400 focus:ring-red-400' : ''}`}
              />
              {errors.selling_price_per_kg && (
                <p className="text-xs text-red-500 mt-1">{errors.selling_price_per_kg}</p>
              )}
            </div>
          </div>

          {/* Row 4: Min Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Stock Alert (KG) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="minimum_stock_kg"
                value={form.minimum_stock_kg}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder="10"
                className={`input-field ${errors.minimum_stock_kg ? 'border-red-400 focus:ring-red-400' : ''}`}
              />
              {errors.minimum_stock_kg && (
                <p className="text-xs text-red-500 mt-1">{errors.minimum_stock_kg}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="Optional product description..."
              className="input-field resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : isEdit ? 'Update Product' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Products() {
  const { partner } = useAuth()

  // Products state
  const [products, setProducts] = useState<ProductWithGrade[]>([])
  const [grades, setGrades] = useState<TeaGrade[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState<ProductWithGrade | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Tea grades management state
  const [gradeName, setGradeName] = useState('')
  const [gradeDesc, setGradeDesc] = useState('')
  const [savingGrade, setSavingGrade] = useState(false)
  const [editingGrade, setEditingGrade] = useState<TeaGrade | null>(null)
  const [gradeNameError, setGradeNameError] = useState('')

  // ── Fetch products ─────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('products')
        .select('*, tea_grades(name)', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (search.trim()) {
        const s = `%${search.trim()}%`
        query = query.or(`name.ilike.${s},brand_name.ilike.${s},sku.ilike.${s}`)
      }
      if (filterGrade) {
        query = query.eq('tea_grade_id', filterGrade)
      }

      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      query = query.range(from, to)

      const { data, error, count } = await query
      if (error) throw error
      setProducts((data as ProductWithGrade[]) ?? [])
      setTotal(count ?? 0)
    } catch (err: any) {
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [search, filterGrade, page])

  // ── Fetch grades ───────────────────────────────────────────────────────────
  const fetchGrades = useCallback(async () => {
    const { data, error } = await supabase
      .from('tea_grades')
      .select('*')
      .order('name')
    if (!error && data) setGrades(data)
  }, [])

  useEffect(() => { fetchGrades() }, [fetchGrades])
  useEffect(() => { fetchProducts() }, [fetchProducts])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, filterGrade])

  // ── Toggle active ──────────────────────────────────────────────────────────
  async function handleToggleActive(product: ProductWithGrade) {
    setTogglingId(product.id)
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !product.is_active, updated_at: new Date().toISOString() })
        .eq('id', product.id)
      if (error) throw error
      toast.success(`Product ${product.is_active ? 'deactivated' : 'activated'}`)
      fetchProducts()
    } catch {
      toast.error('Failed to update product status')
    } finally {
      setTogglingId(null)
    }
  }

  // ── Grade CRUD ─────────────────────────────────────────────────────────────
  function startEditGrade(g: TeaGrade) {
    setEditingGrade(g)
    setGradeName(g.name)
    setGradeDesc(g.description ?? '')
    setGradeNameError('')
  }

  function cancelEditGrade() {
    setEditingGrade(null)
    setGradeName('')
    setGradeDesc('')
    setGradeNameError('')
  }

  async function handleSaveGrade(e: React.FormEvent) {
    e.preventDefault()
    if (!gradeName.trim()) {
      setGradeNameError('Grade name is required')
      return
    }
    if (!partner) return
    setSavingGrade(true)
    try {
      if (editingGrade) {
        const { error } = await supabase
          .from('tea_grades')
          .update({ name: gradeName.trim(), description: gradeDesc.trim() || null, updated_at: new Date().toISOString() })
          .eq('id', editingGrade.id)
        if (error) throw error
        toast.success('Grade updated')
      } else {
        const { error } = await supabase.from('tea_grades').insert({
          name: gradeName.trim(),
          description: gradeDesc.trim() || null,
          created_by: partner.id,
        })
        if (error) throw error
        toast.success('Grade added')
      }
      cancelEditGrade()
      fetchGrades()
    } catch (err: any) {
      if (err?.code === '23505') {
        setGradeNameError('A grade with this name already exists')
      } else {
        toast.error(err?.message ?? 'Failed to save grade')
      }
    } finally {
      setSavingGrade(false)
    }
  }

  async function handleToggleGrade(grade: TeaGrade) {
    try {
      const { error } = await supabase
        .from('tea_grades')
        .update({ is_active: !grade.is_active, updated_at: new Date().toISOString() })
        .eq('id', grade.id)
      if (error) throw error
      toast.success(`Grade ${grade.is_active ? 'deactivated' : 'activated'}`)
      fetchGrades()
    } catch {
      toast.error('Failed to update grade status')
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function isLowStock(p: Product) {
    return p.current_stock_kg <= p.minimum_stock_kg
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Tea Products</h1>
          <p className="page-subtitle">Manage your product catalogue and pricing</p>
        </div>
        <button
          onClick={() => { setEditProduct(null); setShowModal(true) }}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      {/* ── Filter Bar ────────────────────────────────────────────────────── */}
      <div className="card !p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, brand or SKU..."
              className="input-field pl-9"
            />
          </div>
          <select
            value={filterGrade}
            onChange={e => setFilterGrade(e.target.value)}
            className="input-field sm:w-48"
          >
            <option value="">All Grades</option>
            {grades.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Products Table ────────────────────────────────────────────────── */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header">Product</th>
                <th className="table-header">Brand</th>
                <th className="table-header">SKU</th>
                <th className="table-header">Grade</th>
                <th className="table-header text-right">Stock (KG)</th>
                <th className="table-header text-right">Purchase ৳/KG</th>
                <th className="table-header text-right">Selling ৳/KG</th>
                <th className="table-header text-right">Min Stock</th>
                <th className="table-header">Status</th>
                <th className="table-header text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="table-cell text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                      <span className="text-sm">Loading products...</span>
                    </div>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="table-cell text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Package className="w-10 h-10 text-gray-300" />
                      <p className="text-sm font-medium text-gray-500">No products found</p>
                      <p className="text-xs">
                        {search || filterGrade ? 'Try different filters' : 'Add your first product to get started'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                products.map(p => {
                  const low = isLowStock(p)
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-primary-50 rounded-md">
                            <Package className="w-3.5 h-3.5 text-primary-600" />
                          </div>
                          <span className="font-medium text-gray-900">{p.name}</span>
                        </div>
                      </td>
                      <td className="table-cell text-gray-500">{p.brand_name ?? '—'}</td>
                      <td className="table-cell">
                        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{p.sku}</span>
                      </td>
                      <td className="table-cell">
                        <span className="badge-blue">{p.tea_grades?.name ?? '—'}</span>
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={`font-semibold ${low ? 'text-red-600' : 'text-gray-900'}`}>
                            {p.current_stock_kg.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          {low && (
                            <span className="badge-red flex items-center gap-1 text-[10px]">
                              <AlertTriangle className="w-2.5 h-2.5" /> LOW STOCK
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell text-right font-medium">
                        ৳ {p.purchase_price_per_kg.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="table-cell text-right font-medium text-primary-700">
                        ৳ {p.selling_price_per_kg.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="table-cell text-right text-gray-500">
                        {p.minimum_stock_kg.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="table-cell">
                        <span className={p.is_active ? 'badge-green' : 'badge-gray'}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setEditProduct(p); setShowModal(true) }}
                            title="Edit product"
                            className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors text-gray-500"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(p)}
                            disabled={togglingId === p.id}
                            title={p.is_active ? 'Deactivate' : 'Activate'}
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 disabled:opacity-50"
                          >
                            {togglingId === p.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : p.is_active ? (
                              <ToggleRight className="w-4 h-4 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              Showing{' '}
              <span className="font-medium text-gray-700">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
              </span>{' '}
              of <span className="font-medium text-gray-700">{total}</span> products
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-white border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                .reduce<(number | '...')[]>((acc, n, idx, arr) => {
                  if (idx > 0 && (arr[idx - 1] as number) < n - 1) acc.push('...')
                  acc.push(n)
                  return acc
                }, [])
                .map((item, idx) =>
                  item === '...' ? (
                    <span key={`el-${idx}`} className="px-2 text-gray-400 text-sm">...</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item as number)}
                      className={`min-w-[32px] h-8 rounded-lg text-sm font-medium transition-colors ${
                        page === item
                          ? 'bg-primary-700 text-white'
                          : 'hover:bg-white border border-gray-200 text-gray-600'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-white border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Tea Grades Management ─────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-amber-50 rounded-lg">
            <Layers className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Tea Grades</h2>
            <p className="text-xs text-gray-500">Manage your tea grade classifications</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add / Edit Grade Form */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {editingGrade ? `Editing: ${editingGrade.name}` : 'Add New Grade'}
            </h3>
            <form onSubmit={handleSaveGrade} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Grade Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={gradeName}
                  onChange={e => { setGradeName(e.target.value); setGradeNameError('') }}
                  placeholder="e.g. CTC, Orthodox, BOPF..."
                  className={`input-field text-sm ${gradeNameError ? 'border-red-400' : ''}`}
                />
                {gradeNameError && <p className="text-xs text-red-500 mt-1">{gradeNameError}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input
                  type="text"
                  value={gradeDesc}
                  onChange={e => setGradeDesc(e.target.value)}
                  placeholder="Optional description..."
                  className="input-field text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={savingGrade} className="btn-primary flex items-center gap-2 text-sm py-1.5">
                  {savingGrade && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingGrade ? 'Update Grade' : 'Add Grade'}
                </button>
                {editingGrade && (
                  <button type="button" onClick={cancelEditGrade} className="btn-secondary text-sm py-1.5">
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Grades List */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              All Grades ({grades.length})
            </h3>
            {grades.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Tag className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No grades added yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {grades.map(g => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{g.name}</span>
                        <span className={g.is_active ? 'badge-green' : 'badge-gray'}>
                          {g.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      {g.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{g.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button
                        onClick={() => startEditGrade(g)}
                        className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors text-gray-400"
                        title="Edit grade"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleGrade(g)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
                        title={g.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {g.is_active ? (
                          <ToggleRight className="w-4 h-4 text-green-600" />
                        ) : (
                          <ToggleLeft className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Add / Edit Modal ──────────────────────────────────────────────── */}
      {showModal && (
        <ProductModal
          product={editProduct}
          grades={grades}
          onClose={() => { setShowModal(false); setEditProduct(null) }}
          onSaved={fetchProducts}
          partnerId={partner?.id ?? ''}
        />
      )}
    </div>
  )
}
