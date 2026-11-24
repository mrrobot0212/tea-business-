import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Search,
  Eye,
  Edit2,
  X,
  ChevronLeft,
  ChevronRight,
  Package,
  DollarSign,
  TrendingDown,
  AlertCircle,
  Trash2,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ShoppingCart,
  Truck,
  CreditCard,
  Filter,
  Calendar,
  User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../lib/database.types'

// ─── Types ───────────────────────────────────────────────────────────────────

type Supplier = Database['public']['Tables']['suppliers']['Row']
type Product  = Database['public']['Tables']['products']['Row']
type Purchase = Database['public']['Tables']['purchases']['Row']
type PurchaseItem = Database['public']['Tables']['purchase_items']['Row']

type PaymentMethod = 'cash' | 'bkash' | 'nagad' | 'bank' | 'credit'

interface PurchaseWithSupplier extends Purchase {
  supplier: Supplier
  purchase_items: PurchaseItem[]
}

interface PurchaseItemForm {
  id: string // local uuid for key
  product_id: string
  quantity_kg: number | ''
  price_per_kg: number | ''
}

interface NewSupplierForm {
  name: string
  contact_person: string
  phone: string
  address: string
  notes: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash',   label: 'Cash' },
  { value: 'bkash',  label: 'bKash' },
  { value: 'nagad',  label: 'Nagad' },
  { value: 'bank',   label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit (Pay Later)' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `৳${n.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getStatus(paid: number, total: number): 'paid' | 'partial' | 'unpaid' {
  if (paid >= total) return 'paid'
  if (paid > 0)      return 'partial'
  return 'unpaid'
}

function uid() {
  return Math.random().toString(36).slice(2)
}

function emptyItem(): PurchaseItemForm {
  return { id: uid(), product_id: '', quantity_kg: '', price_per_kg: '' }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ paid, total }: { paid: number; total: number }) {
  const s = getStatus(paid, total)
  if (s === 'paid')    return <span className="badge-green">Paid</span>
  if (s === 'partial') return <span className="badge-yellow">Partial</span>
  return <span className="badge-red">Unpaid</span>
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Purchases() {
  const { partner } = useAuth()

  // ── List state ──
  const [purchases, setPurchases]     = useState<PurchaseWithSupplier[]>([])
  const [suppliers, setSuppliers]     = useState<Supplier[]>([])
  const [products, setProducts]       = useState<Product[]>([])
  const [loading, setLoading]         = useState(true)
  const [totalCount, setTotalCount]   = useState(0)
  const [page, setPage]               = useState(1)

  // ── Filters ──
  const [search, setSearch]             = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [dateFrom, setDateFrom]         = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo]             = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  // ── Summary ──
  const [summary, setSummary] = useState({
    totalPurchases: 0,
    totalAmount: 0,
    totalPaid: 0,
    totalDue: 0,
  })

  // ── Modals ──
  const [showNewModal, setShowNewModal]   = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [viewPurchase, setViewPurchase]   = useState<PurchaseWithSupplier | null>(null)
  const [editPurchase, setEditPurchase]   = useState<PurchaseWithSupplier | null>(null)

  // ── New purchase form ──
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1
  const [supplierId, setSupplierId]         = useState('')
  const [purchaseDate, setPurchaseDate]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [invoiceNumber, setInvoiceNumber]   = useState('')
  const [notes, setNotes]                   = useState('')
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [newSupplier, setNewSupplier]       = useState<NewSupplierForm>({
    name: '', contact_person: '', phone: '', address: '', notes: ''
  })
  const [savingSupplier, setSavingSupplier] = useState(false)

  // Step 2
  const [items, setItems] = useState<PurchaseItemForm[]>([emptyItem()])

  // Step 3
  const [transportationCost, setTransportationCost] = useState<number | ''>(0)
  const [packagingCost, setPackagingCost]           = useState<number | ''>(0)
  const [otherCosts, setOtherCosts]                 = useState<number | ''>(0)
  const [amountPaid, setAmountPaid]                 = useState<number | ''>(0)
  const [paymentMethod, setPaymentMethod]           = useState<PaymentMethod>('cash')

  // ── Edit payment state ──
  const [editAmountPaid, setEditAmountPaid]           = useState<number | ''>(0)
  const [editPaymentMethod, setEditPaymentMethod]     = useState<PaymentMethod>('cash')
  const [editNotes, setEditNotes]                     = useState('')
  const [editTransportation, setEditTransportation]   = useState<number | ''>(0)
  const [editPackaging, setEditPackaging]             = useState<number | ''>(0)
  const [editOtherCosts, setEditOtherCosts]           = useState<number | ''>(0)
  const [savingEdit, setSavingEdit]                   = useState(false)

  // ─────────────────────────────────────────────────────────────────────────────
  // Data fetching
  // ─────────────────────────────────────────────────────────────────────────────

  const fetchPurchases = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('purchases')
        .select(`
          *,
          supplier:suppliers(*),
          purchase_items(*)
        `, { count: 'exact' })
        .gte('purchase_date', dateFrom)
        .lte('purchase_date', dateTo)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (filterSupplier) query = query.eq('supplier_id', filterSupplier)
      if (search)         query = query.ilike('invoice_number', `%${search}%`)

      const { data, error, count } = await query
      if (error) throw error

      setPurchases((data as unknown as PurchaseWithSupplier[]) || [])
      setTotalCount(count || 0)
    } catch (err: any) {
      toast.error('Failed to load purchases')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, page, filterSupplier, search])

  const fetchSummary = useCallback(async () => {
    try {
      let query = supabase
        .from('purchases')
        .select('total_landed_cost, amount_paid')
        .gte('purchase_date', dateFrom)
        .lte('purchase_date', dateTo)

      if (filterSupplier) query = query.eq('supplier_id', filterSupplier)

      const { data, error } = await query
      if (error) throw error

      const rows = data || []
      setSummary({
        totalPurchases: rows.length,
        totalAmount:    rows.reduce((s, r) => s + (r.total_landed_cost || 0), 0),
        totalPaid:      rows.reduce((s, r) => s + (r.amount_paid || 0), 0),
        totalDue:       rows.reduce((s, r) => s + Math.max(0, (r.total_landed_cost || 0) - (r.amount_paid || 0)), 0),
      })
    } catch (err: any) {
      console.error('Summary fetch error', err)
    }
  }, [dateFrom, dateTo, filterSupplier])

  const fetchSuppliers = useCallback(async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setSuppliers(data || [])
  }, [])

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setProducts(data || [])
  }, [])

  useEffect(() => {
    fetchPurchases()
  }, [fetchPurchases])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  useEffect(() => {
    fetchSuppliers()
    fetchProducts()
  }, [fetchSuppliers, fetchProducts])

  // ─────────────────────────────────────────────────────────────────────────────
  // Auto-generate invoice number
  // ─────────────────────────────────────────────────────────────────────────────

  const generateInvoiceNumber = useCallback(async () => {
    const year = new Date().getFullYear()
    const prefix = `PUR-${year}-`
    const { data } = await supabase
      .from('purchases')
      .select('invoice_number')
      .ilike('invoice_number', `${prefix}%`)
      .order('invoice_number', { ascending: false })
      .limit(1)

    let seq = 1
    if (data && data.length > 0) {
      const last = data[0].invoice_number
      const parts = last.split('-')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) seq = lastNum + 1
    }
    return `${prefix}${String(seq).padStart(3, '0')}`
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // Open new purchase modal
  // ─────────────────────────────────────────────────────────────────────────────

  const openNewModal = async () => {
    const inv = await generateInvoiceNumber()
    setInvoiceNumber(inv)
    setSupplierId('')
    setPurchaseDate(format(new Date(), 'yyyy-MM-dd'))
    setNotes('')
    setItems([emptyItem()])
    setTransportationCost(0)
    setPackagingCost(0)
    setOtherCosts(0)
    setAmountPaid(0)
    setPaymentMethod('cash')
    setStep(1)
    setShowNewModal(true)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Computed values (Step 3)
  // ─────────────────────────────────────────────────────────────────────────────

  const totalPurchaseAmount = items.reduce((sum, it) => {
    const qty   = typeof it.quantity_kg   === 'number' ? it.quantity_kg   : 0
    const price = typeof it.price_per_kg  === 'number' ? it.price_per_kg  : 0
    return sum + qty * price
  }, 0)

  const totalLandedCost =
    totalPurchaseAmount +
    (typeof transportationCost === 'number' ? transportationCost : 0) +
    (typeof packagingCost       === 'number' ? packagingCost       : 0) +
    (typeof otherCosts          === 'number' ? otherCosts          : 0)

  const remainingDue = totalLandedCost - (typeof amountPaid === 'number' ? amountPaid : 0)

  // ─────────────────────────────────────────────────────────────────────────────
  // Save new supplier (quick-add)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSaveSupplier = async () => {
    if (!newSupplier.name.trim()) {
      toast.error('Supplier name is required')
      return
    }
    if (!partner) return
    setSavingSupplier(true)
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          name:            newSupplier.name.trim(),
          contact_person:  newSupplier.contact_person.trim() || null,
          phone:           newSupplier.phone.trim()           || null,
          address:         newSupplier.address.trim()         || null,
          notes:           newSupplier.notes.trim()           || null,
          created_by:      partner.id,
        })
        .select()
        .single()
      if (error) throw error
      await fetchSuppliers()
      setSupplierId(data.id)
      setShowAddSupplier(false)
      setNewSupplier({ name: '', contact_person: '', phone: '', address: '', notes: '' })
      toast.success('Supplier added')
    } catch (err: any) {
      toast.error('Failed to add supplier')
    } finally {
      setSavingSupplier(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step navigation & validation
  // ─────────────────────────────────────────────────────────────────────────────

  const validateStep1 = () => {
    if (!supplierId)        { toast.error('Please select a supplier');      return false }
    if (!purchaseDate)      { toast.error('Please enter a purchase date');  return false }
    if (!invoiceNumber)     { toast.error('Invoice number is required');    return false }
    return true
  }

  const validateStep2 = () => {
    if (items.length === 0) { toast.error('Add at least one item');         return false }
    for (const it of items) {
      if (!it.product_id)                              { toast.error('Select a product for all items');      return false }
      if (!it.quantity_kg || it.quantity_kg <= 0)      { toast.error('Quantity must be > 0 for all items'); return false }
      if (!it.price_per_kg || it.price_per_kg <= 0)   { toast.error('Price must be > 0 for all items');    return false }
    }
    // Check for duplicate products
    const ids = items.map(i => i.product_id)
    if (new Set(ids).size !== ids.length) {
      toast.error('Duplicate products in items — combine them')
      return false
    }
    return true
  }

  const handleNextStep = () => {
    if (step === 1 && !validateStep1()) return
    if (step === 2 && !validateStep2()) return
    setStep(s => s + 1)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Save new purchase
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSavePurchase = async () => {
    if (!partner) return
    const paid = typeof amountPaid === 'number' ? amountPaid : 0

    if (paid > totalLandedCost) {
      toast.error('Amount paid cannot exceed total landed cost')
      return
    }

    setSaving(true)
    try {
      // 1. Insert purchase
      const { data: purchaseData, error: purchaseError } = await supabase
        .from('purchases')
        .insert({
          invoice_number:      invoiceNumber,
          supplier_id:         supplierId,
          purchase_date:       purchaseDate,
          total_amount:        totalPurchaseAmount,
          transportation_cost: typeof transportationCost === 'number' ? transportationCost : 0,
          packaging_cost:      typeof packagingCost       === 'number' ? packagingCost       : 0,
          other_costs:         typeof otherCosts          === 'number' ? otherCosts          : 0,
          total_landed_cost:   totalLandedCost,
          amount_paid:         paid,
          notes:               notes.trim() || null,
          created_by:          partner.id,
        })
        .select()
        .single()
      if (purchaseError) throw purchaseError

      const purchaseId = purchaseData.id

      // 2. Insert purchase items
      const purchaseItemsInsert = items.map(it => ({
        purchase_id:   purchaseId,
        product_id:    it.product_id,
        quantity_kg:   it.quantity_kg as number,
        price_per_kg:  it.price_per_kg as number,
        total_amount:  (it.quantity_kg as number) * (it.price_per_kg as number),
      }))

      const { error: itemsError } = await supabase
        .from('purchase_items')
        .insert(purchaseItemsInsert)
      if (itemsError) throw itemsError

      // 3 & 4. Update products stock + weighted avg cost and insert inventory movements
      for (const it of items) {
        const qty   = it.quantity_kg  as number
        const price = it.price_per_kg as number

        // Fetch current product
        const { data: prod, error: prodErr } = await supabase
          .from('products')
          .select('current_stock_kg, purchase_price_per_kg')
          .eq('id', it.product_id)
          .single()
        if (prodErr) throw prodErr

        const oldStock = prod.current_stock_kg        || 0
        const oldCost  = prod.purchase_price_per_kg   || 0
        const newStock = oldStock + qty
        const newWAC   = newStock > 0
          ? (oldStock * oldCost + qty * price) / newStock
          : price

        const { error: updateErr } = await supabase
          .from('products')
          .update({
            current_stock_kg:      newStock,
            purchase_price_per_kg: newWAC,
            updated_at:            new Date().toISOString(),
          })
          .eq('id', it.product_id)
        if (updateErr) throw updateErr

        // Insert inventory movement
        const { error: movErr } = await supabase
          .from('inventory_movements')
          .insert({
            product_id:     it.product_id,
            movement_type:  'purchase',
            quantity_kg:    qty,
            reference_id:   purchaseId,
            notes:          `Purchase: ${invoiceNumber}`,
            created_by:     partner.id,
          })
        if (movErr) throw movErr
      }

      // 5. Update supplier totals
      const { data: sup, error: supErr } = await supabase
        .from('suppliers')
        .select('total_purchased, total_paid')
        .eq('id', supplierId)
        .single()
      if (supErr) throw supErr

      const { error: supUpdateErr } = await supabase
        .from('suppliers')
        .update({
          total_purchased: (sup.total_purchased || 0) + totalLandedCost,
          total_paid:      (sup.total_paid      || 0) + paid,
          updated_at:      new Date().toISOString(),
        })
        .eq('id', supplierId)
      if (supUpdateErr) throw supUpdateErr

      // 6. Activity log
      await supabase.from('activity_logs').insert({
        partner_id:  partner.id,
        action:      'CREATE',
        table_name:  'purchases',
        record_id:   purchaseId,
        new_values:  {
          invoice_number:    invoiceNumber,
          supplier_id:       supplierId,
          total_landed_cost: totalLandedCost,
          amount_paid:       paid,
          items_count:       items.length,
        },
      })

      toast.success(`Purchase ${invoiceNumber} saved successfully!`)
      setShowNewModal(false)
      fetchPurchases()
      fetchSummary()
      fetchSuppliers()
    } catch (err: any) {
      console.error('Save purchase error:', err)
      toast.error(err.message || 'Failed to save purchase')
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Open edit modal
  // ─────────────────────────────────────────────────────────────────────────────

  const openEditModal = (p: PurchaseWithSupplier) => {
    setEditPurchase(p)
    setEditAmountPaid(p.amount_paid)
    setEditPaymentMethod('cash')
    setEditNotes(p.notes || '')
    setEditTransportation(p.transportation_cost)
    setEditPackaging(p.packaging_cost)
    setEditOtherCosts(p.other_costs)
    setShowEditModal(true)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Save edit (costs & payment update)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSaveEdit = async () => {
    if (!editPurchase || !partner) return
    const newPaid = typeof editAmountPaid === 'number' ? editAmountPaid : 0
    const trans   = typeof editTransportation === 'number' ? editTransportation : 0
    const pkg     = typeof editPackaging      === 'number' ? editPackaging      : 0
    const other   = typeof editOtherCosts     === 'number' ? editOtherCosts     : 0
    const newLanded = editPurchase.total_amount + trans + pkg + other

    if (newPaid > newLanded) {
      toast.error('Amount paid cannot exceed total landed cost')
      return
    }

    setSavingEdit(true)
    try {
      // Update purchase
      const { error: upErr } = await supabase
        .from('purchases')
        .update({
          transportation_cost: trans,
          packaging_cost:      pkg,
          other_costs:         other,
          total_landed_cost:   newLanded,
          amount_paid:         newPaid,
          notes:               editNotes.trim() || null,
          updated_at:          new Date().toISOString(),
        })
        .eq('id', editPurchase.id)
      if (upErr) throw upErr

      // Adjust supplier totals (diff-based)
      const oldLanded = editPurchase.total_landed_cost
      const oldPaid   = editPurchase.amount_paid
      const { data: sup } = await supabase
        .from('suppliers')
        .select('total_purchased, total_paid')
        .eq('id', editPurchase.supplier_id)
        .single()

      if (sup) {
        await supabase.from('suppliers').update({
          total_purchased: (sup.total_purchased || 0) - oldLanded + newLanded,
          total_paid:      (sup.total_paid      || 0) - oldPaid   + newPaid,
          updated_at:      new Date().toISOString(),
        }).eq('id', editPurchase.supplier_id)
      }

      // Activity log
      await supabase.from('activity_logs').insert({
        partner_id:  partner.id,
        action:      'UPDATE',
        table_name:  'purchases',
        record_id:   editPurchase.id,
        old_values:  { amount_paid: oldPaid, total_landed_cost: oldLanded },
        new_values:  { amount_paid: newPaid, total_landed_cost: newLanded },
      })

      toast.success('Purchase updated')
      setShowEditModal(false)
      fetchPurchases()
      fetchSummary()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update purchase')
    } finally {
      setSavingEdit(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Item form helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const updateItem = (index: number, field: keyof PurchaseItemForm, value: string | number) => {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, [field]: value } : it))
  }

  const removeItem = (index: number) => {
    if (items.length === 1) { toast.error('At least one item is required'); return }
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Pagination
  // ─────────────────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Purchase Management</h1>
          <p className="page-subtitle">Track all your tea purchases from suppliers</p>
        </div>
        <button onClick={openNewModal} className="btn-primary flex items-center gap-2 self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          New Purchase
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Total Purchases</span>
            <ShoppingCart className="w-5 h-5 text-primary-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.totalPurchases}</p>
          <p className="text-xs text-gray-400 mt-1">This period</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Total Amount</span>
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{fmt(summary.totalAmount)}</p>
          <p className="text-xs text-gray-400 mt-1">Incl. all costs</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Total Paid</span>
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">{fmt(summary.totalPaid)}</p>
          <p className="text-xs text-gray-400 mt-1">Payments made</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Total Due</span>
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-600">{fmt(summary.totalDue)}</p>
          <p className="text-xs text-gray-400 mt-1">Outstanding balance</p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="card">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search invoice number..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="input-field pl-9"
            />
          </div>
          {/* Supplier filter */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={filterSupplier}
              onChange={e => { setFilterSupplier(e.target.value); setPage(1) }}
              className="input-field pl-9 pr-8 min-w-[180px]"
            >
              <option value="">All Suppliers</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {/* Date range */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1) }}
              className="input-field"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1) }}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">Invoice #</th>
                <th className="table-header">Supplier</th>
                <th className="table-header">Date</th>
                <th className="table-header text-center">Items</th>
                <th className="table-header text-right">Total Amount</th>
                <th className="table-header text-right">Landed Cost</th>
                <th className="table-header text-right">Paid</th>
                <th className="table-header text-right">Due</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="table-cell text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-600" />
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={10} className="table-cell text-center py-12 text-gray-500">
                    No purchases found for the selected filters.
                  </td>
                </tr>
              ) : (
                purchases.map(p => {
                  const due = Math.max(0, p.total_landed_cost - p.amount_paid)
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium text-primary-700">{p.invoice_number}</td>
                      <td className="table-cell">{p.supplier?.name || '—'}</td>
                      <td className="table-cell text-gray-600">{format(parseISO(p.purchase_date), 'dd MMM yyyy')}</td>
                      <td className="table-cell text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                          {p.purchase_items?.length || 0}
                        </span>
                      </td>
                      <td className="table-cell text-right font-medium">{fmt(p.total_amount)}</td>
                      <td className="table-cell text-right font-medium text-blue-700">{fmt(p.total_landed_cost)}</td>
                      <td className="table-cell text-right text-green-700">{fmt(p.amount_paid)}</td>
                      <td className="table-cell text-right text-red-600">{fmt(due)}</td>
                      <td className="table-cell text-center">
                        <StatusBadge paid={p.amount_paid} total={p.total_landed_cost} />
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => { setViewPurchase(p); setShowViewModal(true) }}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
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
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .reduce<(number | '...')[]>((acc, n, i, arr) => {
                  if (i > 0 && (n as number) - (arr[i - 1] as number) > 1) acc.push('...')
                  acc.push(n)
                  return acc
                }, [])
                .map((n, i) =>
                  n === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-gray-400">…</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPage(n as number)}
                      className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                        page === n ? 'bg-primary-600 text-white' : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {n}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          NEW PURCHASE MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8">
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">New Purchase</h2>
                <p className="text-sm text-gray-500 mt-0.5">{invoiceNumber}</p>
              </div>
              <button onClick={() => setShowNewModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Stepper */}
            <div className="px-6 pt-5">
              <div className="flex items-center gap-0">
                {[
                  { n: 1, label: 'Purchase Details', icon: ShoppingCart },
                  { n: 2, label: 'Items',            icon: Package },
                  { n: 3, label: 'Costs & Payment',  icon: CreditCard },
                ].map(({ n, label, icon: Icon }, idx) => (
                  <React.Fragment key={n}>
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors ${
                        step > n  ? 'bg-primary-600 border-primary-600 text-white'
                        : step === n ? 'border-primary-600 bg-white text-primary-600'
                        : 'border-gray-300 bg-white text-gray-400'
                      }`}>
                        {step > n ? <CheckCircle2 className="w-4 h-4" /> : n}
                      </div>
                      <span className={`text-xs font-medium hidden sm:block ${
                        step >= n ? 'text-primary-700' : 'text-gray-400'
                      }`}>{label}</span>
                    </div>
                    {idx < 2 && (
                      <div className={`flex-1 h-0.5 mx-2 transition-colors ${step > n ? 'bg-primary-600' : 'bg-gray-200'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* ── Step 1: Purchase Details ── */}
            {step === 1 && (
              <div className="p-6 space-y-4">
                {/* Supplier */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supplier <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={supplierId}
                      onChange={e => setSupplierId(e.target.value)}
                      className="input-field flex-1"
                    >
                      <option value="">— Select supplier —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowAddSupplier(v => !v)}
                      className="btn-secondary text-sm flex-shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                </div>

                {/* Quick add supplier */}
                {showAddSupplier && (
                  <div className="border border-dashed border-primary-300 rounded-lg p-4 bg-primary-50 space-y-3">
                    <p className="text-sm font-semibold text-primary-800">Quick Add Supplier</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                        <input
                          className="input-field"
                          placeholder="Supplier name"
                          value={newSupplier.name}
                          onChange={e => setNewSupplier(p => ({ ...p, name: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Contact Person</label>
                        <input
                          className="input-field"
                          placeholder="Contact name"
                          value={newSupplier.contact_person}
                          onChange={e => setNewSupplier(p => ({ ...p, contact_person: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                        <input
                          className="input-field"
                          placeholder="Phone number"
                          value={newSupplier.phone}
                          onChange={e => setNewSupplier(p => ({ ...p, phone: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                        <input
                          className="input-field"
                          placeholder="Address"
                          value={newSupplier.address}
                          onChange={e => setNewSupplier(p => ({ ...p, address: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowAddSupplier(false)} className="btn-secondary text-sm">Cancel</button>
                      <button onClick={handleSaveSupplier} disabled={savingSupplier} className="btn-primary text-sm flex items-center gap-1">
                        {savingSupplier && <Loader2 className="w-3 h-3 animate-spin" />}
                        Save Supplier
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Purchase Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={e => setPurchaseDate(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={e => setInvoiceNumber(e.target.value)}
                      className="input-field font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any notes about this purchase..."
                    className="input-field resize-none"
                  />
                </div>
              </div>
            )}

            {/* ── Step 2: Purchase Items ── */}
            {step === 2 && (
              <div className="p-6 space-y-4">
                <div className="space-y-3">
                  {/* Header row */}
                  <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                    <div className="col-span-5">Product</div>
                    <div className="col-span-2 text-right">Qty (KG)</div>
                    <div className="col-span-2 text-right">Price/KG (৳)</div>
                    <div className="col-span-2 text-right">Subtotal</div>
                    <div className="col-span-1"></div>
                  </div>

                  {items.map((item, idx) => {
                    const sub = (typeof item.quantity_kg === 'number' ? item.quantity_kg : 0)
                      * (typeof item.price_per_kg === 'number' ? item.price_per_kg : 0)
                    return (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <select
                            value={item.product_id}
                            onChange={e => updateItem(idx, 'product_id', e.target.value)}
                            className="input-field text-sm"
                          >
                            <option value="">— Product —</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name}{p.brand_name ? ` (${p.brand_name})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={item.quantity_kg}
                            onChange={e => updateItem(idx, 'quantity_kg', e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="input-field text-sm text-right"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={item.price_per_kg}
                            onChange={e => updateItem(idx, 'price_per_kg', e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="input-field text-sm text-right"
                          />
                        </div>
                        <div className="col-span-2 text-right text-sm font-semibold text-gray-700 pr-1">
                          {fmt(sub)}
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <button
                            onClick={() => removeItem(idx)}
                            className="p-1.5 hover:bg-red-50 rounded text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={() => setItems(prev => [...prev, emptyItem()])}
                  className="btn-secondary text-sm flex items-center gap-1.5 w-full justify-center"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>

                {/* Items summary */}
                <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">{items.length}</span> item{items.length !== 1 ? 's' : ''} •{' '}
                    <span className="font-medium">
                      {items.reduce((s, i) => s + (typeof i.quantity_kg === 'number' ? i.quantity_kg : 0), 0).toFixed(2)} KG
                    </span> total
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Items Total</p>
                    <p className="text-lg font-bold text-gray-900">{fmt(totalPurchaseAmount)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: Costs & Payment ── */}
            {step === 3 && (
              <div className="p-6 space-y-5">
                {/* Additional costs */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-gray-400" /> Additional Costs
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Transportation (৳)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={transportationCost}
                        onChange={e => setTransportationCost(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Packaging (৳)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={packagingCost}
                        onChange={e => setPackagingCost(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Other Costs (৳)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={otherCosts}
                        onChange={e => setOtherCosts(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>

                {/* Cost breakdown */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Purchase Amount</span>
                    <span className="font-medium">{fmt(totalPurchaseAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Transportation</span>
                    <span>{fmt(typeof transportationCost === 'number' ? transportationCost : 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Packaging</span>
                    <span>{fmt(typeof packagingCost === 'number' ? packagingCost : 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Other Costs</span>
                    <span>{fmt(typeof otherCosts === 'number' ? otherCosts : 0)}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-blue-700">
                    <span>Total Landed Cost</span>
                    <span>{fmt(totalLandedCost)}</span>
                  </div>
                </div>

                {/* Payment */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-gray-400" /> Payment
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Amount Paid (৳)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max={totalLandedCost}
                        value={amountPaid}
                        onChange={e => setAmountPaid(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                      <select
                        value={paymentMethod}
                        onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                        className="input-field"
                      >
                        {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Payment summary */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Total Landed Cost</span>
                    <span className="font-medium">{fmt(totalLandedCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-700">
                    <span>Amount Paid</span>
                    <span className="font-medium">{fmt(typeof amountPaid === 'number' ? amountPaid : 0)}</span>
                  </div>
                  <div className={`border-t border-gray-200 pt-2 flex justify-between font-bold ${remainingDue > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    <span>Remaining Due</span>
                    <span>{fmt(Math.max(0, remainingDue))}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Modal footer */}
            <div className="px-6 pb-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
              <button
                onClick={() => step > 1 ? setStep(s => s - 1) : setShowNewModal(false)}
                className="btn-secondary flex items-center gap-2"
              >
                {step > 1 ? <><ArrowLeft className="w-4 h-4" />Back</> : <><X className="w-4 h-4" />Cancel</>}
              </button>
              {step < 3 ? (
                <button onClick={handleNextStep} className="btn-primary flex items-center gap-2">
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={handleSavePurchase} disabled={saving} className="btn-primary flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {saving ? 'Saving…' : 'Save Purchase'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          VIEW PURCHASE DETAIL MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      {showViewModal && viewPurchase && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{viewPurchase.invoice_number}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {format(parseISO(viewPurchase.purchase_date), 'dd MMMM yyyy')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge paid={viewPurchase.amount_paid} total={viewPurchase.total_landed_cost} />
                <button onClick={() => setShowViewModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Supplier info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Supplier</h3>
                <p className="font-semibold text-gray-900">{viewPurchase.supplier?.name}</p>
                {viewPurchase.supplier?.contact_person && (
                  <p className="text-sm text-gray-600">Contact: {viewPurchase.supplier.contact_person}</p>
                )}
                {viewPurchase.supplier?.phone && (
                  <p className="text-sm text-gray-600">Phone: {viewPurchase.supplier.phone}</p>
                )}
                {viewPurchase.supplier?.address && (
                  <p className="text-sm text-gray-600">Address: {viewPurchase.supplier.address}</p>
                )}
              </div>

              {/* Items */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Purchase Items</h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold text-gray-600">Product</th>
                        <th className="text-right px-4 py-2 font-semibold text-gray-600">Qty (KG)</th>
                        <th className="text-right px-4 py-2 font-semibold text-gray-600">Price/KG</th>
                        <th className="text-right px-4 py-2 font-semibold text-gray-600">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewPurchase.purchase_items.map((item, idx) => {
                        const prod = products.find(p => p.id === item.product_id)
                        return (
                          <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-4 py-2.5 font-medium text-gray-900">
                              {prod ? `${prod.name}${prod.brand_name ? ` (${prod.brand_name})` : ''}` : item.product_id}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{item.quantity_kg.toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{fmt(item.price_per_kg)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmt(item.total_amount)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cost breakdown */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cost Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Purchase Amount</span>
                    <span className="font-medium">{fmt(viewPurchase.total_amount)}</span>
                  </div>
                  {viewPurchase.transportation_cost > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Transportation</span>
                      <span>{fmt(viewPurchase.transportation_cost)}</span>
                    </div>
                  )}
                  {viewPurchase.packaging_cost > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Packaging</span>
                      <span>{fmt(viewPurchase.packaging_cost)}</span>
                    </div>
                  )}
                  {viewPurchase.other_costs > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Other Costs</span>
                      <span>{fmt(viewPurchase.other_costs)}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-blue-700">
                    <span>Total Landed Cost</span>
                    <span>{fmt(viewPurchase.total_landed_cost)}</span>
                  </div>
                </div>
              </div>

              {/* Payment status */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Payment Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-green-700">
                    <span>Amount Paid</span>
                    <span className="font-bold">{fmt(viewPurchase.amount_paid)}</span>
                  </div>
                  <div className={`flex justify-between font-bold ${
                    viewPurchase.total_landed_cost - viewPurchase.amount_paid > 0 ? 'text-red-600' : 'text-green-700'
                  }`}>
                    <span>Remaining Due</span>
                    <span>{fmt(Math.max(0, viewPurchase.total_landed_cost - viewPurchase.amount_paid))}</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (viewPurchase.amount_paid / viewPurchase.total_landed_cost) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1 text-right">
                    {((viewPurchase.amount_paid / viewPurchase.total_landed_cost) * 100).toFixed(0)}% paid
                  </p>
                </div>
              </div>

              {/* Notes */}
              {viewPurchase.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-yellow-800 mb-1">Notes</p>
                  <p className="text-sm text-yellow-900">{viewPurchase.notes}</p>
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex justify-between items-center border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400">
                Created: {format(parseISO(viewPurchase.created_at), 'dd MMM yyyy, hh:mm a')}
              </p>
              <button onClick={() => setShowViewModal(false)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          EDIT PURCHASE MODAL (Costs & Payment)
      ════════════════════════════════════════════════════════════════════════ */}
      {showEditModal && editPurchase && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Edit Purchase</h2>
                <p className="text-sm text-gray-500 mt-0.5">{editPurchase.invoice_number}</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Read-only summary */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="text-gray-500">Purchase Amount: <span className="font-semibold text-gray-900">{fmt(editPurchase.total_amount)}</span></p>
              </div>

              {/* Costs */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Additional Costs</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Transportation (৳)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={editTransportation}
                      onChange={e => setEditTransportation(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Packaging (৳)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={editPackaging}
                      onChange={e => setEditPackaging(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Other (৳)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={editOtherCosts}
                      onChange={e => setEditOtherCosts(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="input-field"
                    />
                  </div>
                </div>
              </div>

              {/* Computed landed cost */}
              {(() => {
                const trans  = typeof editTransportation === 'number' ? editTransportation : 0
                const pkg    = typeof editPackaging      === 'number' ? editPackaging      : 0
                const other  = typeof editOtherCosts     === 'number' ? editOtherCosts     : 0
                const landed = editPurchase.total_amount + trans + pkg + other
                const paid   = typeof editAmountPaid     === 'number' ? editAmountPaid     : 0
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between font-bold text-blue-800">
                      <span>New Landed Cost</span>
                      <span>{fmt(landed)}</span>
                    </div>
                    <div className={`flex justify-between font-bold ${landed - paid > 0 ? 'text-red-600' : 'text-green-700'}`}>
                      <span>Remaining Due</span>
                      <span>{fmt(Math.max(0, landed - paid))}</span>
                    </div>
                  </div>
                )
              })()}

              {/* Payment */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount Paid (৳)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={editAmountPaid}
                      onChange={e => setEditAmountPaid(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                    <select
                      value={editPaymentMethod}
                      onChange={e => setEditPaymentMethod(e.target.value as PaymentMethod)}
                      className="input-field"
                    >
                      {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  className="input-field resize-none"
                />
              </div>
            </div>

            <div className="px-6 pb-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
              <button onClick={() => setShowEditModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSaveEdit} disabled={savingEdit} className="btn-primary flex items-center gap-2">
                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {savingEdit ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
