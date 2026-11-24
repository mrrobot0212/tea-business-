import React, { useEffect, useState, useCallback } from 'react'
import {
  Plus, Search, Filter, Printer, Eye, TrendingUp,
  ShoppingCart, FileText, AlertCircle, X, Trash2, ChevronDown,
  Package, Calendar, CreditCard, Truck
} from 'lucide-react'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../lib/database.types'

type Sale = Database['public']['Tables']['sales']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type Product = Database['public']['Tables']['products']['Row']
type PaymentMethod = 'cash' | 'credit' | 'bkash' | 'nagad' | 'bank'
type DeliveryStatus = 'pending' | 'delivered' | 'cancelled'

interface SaleWithCustomer extends Sale {
  customers: { shop_name: string; owner_name: string; phone: string }
  sale_items: {
    id: string
    product_id: string
    quantity_kg: number
    price_per_kg: number
    cost_per_kg: number
    total_amount: number
    products: { name: string; sku: string }
  }[]
}

interface SaleItem {
  id: string
  product_id: string
  quantity_kg: number
  price_per_kg: number
  total_amount: number
}

interface NewSaleForm {
  customer_id: string
  sale_date: string
  invoice_number: string
  items: SaleItem[]
  discount: number
  paid_amount: number
  payment_method: PaymentMethod
  delivery_status: DeliveryStatus
  notes: string
}

const emptyItem = (): SaleItem => ({
  id: crypto.randomUUID(),
  product_id: '',
  quantity_kg: 0,
  price_per_kg: 0,
  total_amount: 0,
})

function getPaymentStatus(sale: Sale): 'paid' | 'partial' | 'credit' {
  const due = sale.final_amount - sale.paid_amount
  if (due <= 0) return 'paid'
  if (sale.paid_amount > 0) return 'partial'
  return 'credit'
}

// ─── Print Invoice Component ────────────────────────────────────────────────
function PrintInvoice({ sale, onClose }: { sale: SaleWithCustomer; onClose: () => void }) {
  const totalQty = sale.sale_items.reduce((s, i) => s + i.quantity_kg, 0)

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-auto">
      {/* Screen-only controls */}
      <div className="print:hidden flex gap-3 p-4 bg-gray-100 border-b">
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
          <Printer size={16} /> Print Invoice
        </button>
        <button onClick={onClose} className="btn-secondary flex items-center gap-2">
          <X size={16} /> Close
        </button>
      </div>

      {/* Invoice content */}
      <div id="invoice-print" className="max-w-2xl mx-auto p-8 print:p-6 print:max-w-none">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-green-700">TeaLedger</h1>
            <p className="text-gray-500 text-sm">Tea Wholesale Management</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-800">INVOICE</p>
            <p className="text-green-700 font-semibold">{sale.invoice_number}</p>
            <p className="text-gray-500 text-sm">{format(new Date(sale.sale_date), 'dd MMM yyyy')}</p>
          </div>
        </div>

        {/* Customer Info */}
        <div className="grid grid-cols-2 gap-6 mb-8 p-4 bg-gray-50 rounded-lg print:border print:border-gray-200">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Bill To</p>
            <p className="font-bold text-gray-800">{sale.customers.shop_name}</p>
            <p className="text-gray-600">{sale.customers.owner_name}</p>
            <p className="text-gray-600">{sale.customers.phone}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Payment Info</p>
            <p className="text-gray-600 capitalize">Method: {sale.payment_method}</p>
            <p className="text-gray-600 capitalize">Delivery: {sale.delivery_status}</p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full mb-6">
          <thead>
            <tr className="bg-green-700 text-white">
              <th className="text-left p-3 text-sm">#</th>
              <th className="text-left p-3 text-sm">Product</th>
              <th className="text-right p-3 text-sm">Qty (KG)</th>
              <th className="text-right p-3 text-sm">Price/KG</th>
              <th className="text-right p-3 text-sm">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.sale_items.map((item, idx) => (
              <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="p-3 text-sm text-gray-600">{idx + 1}</td>
                <td className="p-3">
                  <p className="font-medium text-gray-800">{item.products.name}</p>
                  <p className="text-xs text-gray-500">{item.products.sku}</p>
                </td>
                <td className="p-3 text-right text-sm">{item.quantity_kg.toFixed(2)}</td>
                <td className="p-3 text-right text-sm">৳{item.price_per_kg.toFixed(2)}</td>
                <td className="p-3 text-right font-medium">৳{item.total_amount.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-200 bg-gray-50">
              <td colSpan={2} className="p-3 text-sm text-gray-500">Total Items: {sale.sale_items.length} | Total Qty: {totalQty.toFixed(2)} KG</td>
              <td colSpan={3}></td>
            </tr>
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-64">
            <div className="flex justify-between py-2 text-gray-600">
              <span>Subtotal</span>
              <span>৳{sale.total_amount.toFixed(2)}</span>
            </div>
            {sale.discount > 0 && (
              <div className="flex justify-between py-2 text-red-600">
                <span>Discount</span>
                <span>-৳{sale.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between py-2 text-lg font-bold border-t border-gray-200 mt-1">
              <span>Final Amount</span>
              <span>৳{sale.final_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2 text-green-700">
              <span>Paid Amount</span>
              <span>৳{sale.paid_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2 font-semibold border-t border-gray-200 mt-1 text-red-600">
              <span>Balance Due</span>
              <span>৳{(sale.final_amount - sale.paid_amount).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {sale.notes && (
          <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Notes</p>
            <p className="text-gray-700 text-sm">{sale.notes}</p>
          </div>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-12 mt-16 pt-8 border-t border-gray-200">
          <div className="text-center">
            <div className="border-b border-gray-400 mb-2 h-12"></div>
            <p className="text-sm text-gray-600">Customer Signature</p>
            <p className="text-xs text-gray-400">{sale.customers.shop_name}</p>
          </div>
          <div className="text-center">
            <div className="border-b border-gray-400 mb-2 h-12"></div>
            <p className="text-sm text-gray-600">Authorized Signature</p>
            <p className="text-xs text-gray-400">TeaLedger</p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Generated by TeaLedger • {format(new Date(), 'dd MMM yyyy, hh:mm a')}
        </p>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-print, #invoice-print * { visibility: visible; }
          #invoice-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  )
}

// ─── New Sale Modal ──────────────────────────────────────────────────────────
function NewSaleModal({
  onClose,
  onSaved,
  customers,
  products,
  nextInvoiceNumber,
}: {
  onClose: () => void
  onSaved: () => void
  customers: Customer[]
  products: Product[]
  nextInvoiceNumber: string
}) {
  const { partner } = useAuth()
  const [saving, setSaving] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  const [form, setForm] = useState<NewSaleForm>({
    customer_id: '',
    sale_date: format(new Date(), 'yyyy-MM-dd'),
    invoice_number: nextInvoiceNumber,
    items: [emptyItem()],
    discount: 0,
    paid_amount: 0,
    payment_method: 'cash',
    delivery_status: 'pending',
    notes: '',
  })

  const selectedCustomer = customers.find(c => c.id === form.customer_id)
  const filteredCustomers = customers.filter(c =>
    c.shop_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.owner_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  )

  const totalAmount = form.items.reduce((s, i) => s + i.total_amount, 0)
  const finalAmount = Math.max(0, totalAmount - form.discount)
  const remainingDue = Math.max(0, finalAmount - form.paid_amount)

  function updateItem(id: string, field: keyof SaleItem, value: string | number) {
    setForm(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== id) return item
        const updated = { ...item, [field]: value }
        if (field === 'product_id') {
          const prod = products.find(p => p.id === value)
          updated.price_per_kg = prod?.selling_price_per_kg ?? 0
          updated.total_amount = updated.quantity_kg * updated.price_per_kg
        } else if (field === 'quantity_kg' || field === 'price_per_kg') {
          updated.total_amount = updated.quantity_kg * updated.price_per_kg
        }
        return updated
      })
    }))
  }

  function addItem() {
    setForm(prev => ({ ...prev, items: [...prev.items, emptyItem()] }))
  }

  function removeItem(id: string) {
    setForm(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }))
  }

  async function handleSave() {
    if (!partner) return toast.error('Not authenticated')
    if (!form.customer_id) return toast.error('Please select a customer')
    if (form.items.length === 0) return toast.error('Add at least one item')

    for (const item of form.items) {
      if (!item.product_id) return toast.error('Select product for all rows')
      if (item.quantity_kg <= 0) return toast.error('Quantity must be > 0')
      const prod = products.find(p => p.id === item.product_id)
      if (!prod) return toast.error('Product not found')
      if (item.quantity_kg > prod.current_stock_kg) {
        return toast.error(`Insufficient stock for ${prod.name}. Available: ${prod.current_stock_kg.toFixed(2)} KG`)
      }
    }

    setSaving(true)
    try {
      // 1. Insert sale
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          invoice_number: form.invoice_number,
          customer_id: form.customer_id,
          sale_date: form.sale_date,
          total_amount: totalAmount,
          discount: form.discount,
          final_amount: finalAmount,
          paid_amount: form.paid_amount,
          payment_method: form.payment_method,
          delivery_status: form.delivery_status,
          notes: form.notes || null,
          created_by: partner.id,
        })
        .select('id')
        .single()

      if (saleError) throw saleError
      const saleId = saleData.id

      // 2. Insert sale_items + update stock + inventory movements
      for (const item of form.items) {
        const prod = products.find(p => p.id === item.product_id)!

        const { error: itemError } = await supabase.from('sale_items').insert({
          sale_id: saleId,
          product_id: item.product_id,
          quantity_kg: item.quantity_kg,
          price_per_kg: item.price_per_kg,
          cost_per_kg: prod.purchase_price_per_kg,
          total_amount: item.total_amount,
        })
        if (itemError) throw itemError

        // 3. Decrease stock
        const { error: stockError } = await supabase
          .from('products')
          .update({ current_stock_kg: prod.current_stock_kg - item.quantity_kg, updated_at: new Date().toISOString() })
          .eq('id', item.product_id)
        if (stockError) throw stockError

        // 4. Inventory movement
        const { error: movError } = await supabase.from('inventory_movements').insert({
          product_id: item.product_id,
          movement_type: 'sale',
          quantity_kg: -item.quantity_kg,
          reference_id: saleId,
          notes: `Sale: ${form.invoice_number}`,
          created_by: partner.id,
        })
        if (movError) throw movError
      }

      // 5. Update customer totals
      const customer = customers.find(c => c.id === form.customer_id)!
      const customerUpdate: Record<string, unknown> = {
        total_purchased_amount: (customer.total_purchased_amount || 0) + finalAmount,
        total_paid_amount: (customer.total_paid_amount || 0) + form.paid_amount,
        last_purchase_date: form.sale_date,
        updated_at: new Date().toISOString(),
      }
      if (form.payment_method !== 'credit') {
        customerUpdate.last_payment_date = form.sale_date
      }
      const { error: custError } = await supabase
        .from('customers')
        .update(customerUpdate)
        .eq('id', form.customer_id)
      if (custError) throw custError

      // 6. Activity log
      await supabase.from('activity_logs').insert({
        partner_id: partner.id,
        action: 'CREATE_SALE',
        table_name: 'sales',
        record_id: saleId,
        new_values: { invoice_number: form.invoice_number, final_amount: finalAmount, customer_id: form.customer_id },
      })

      toast.success(`Sale ${form.invoice_number} recorded successfully!`)
      onSaved()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save sale')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-start justify-center overflow-y-auto py-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-800">New Sale</h2>
            <p className="text-sm text-gray-500">Invoice: <span className="font-semibold text-green-700">{form.invoice_number}</span></p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Customer & Date Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer Dropdown */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
              <div
                className="input-field flex items-center justify-between cursor-pointer"
                onClick={() => setShowCustomerDropdown(v => !v)}
              >
                <span className={selectedCustomer ? 'text-gray-800' : 'text-gray-400'}>
                  {selectedCustomer ? `${selectedCustomer.shop_name} (${selectedCustomer.phone})` : 'Select customer...'}
                </span>
                <ChevronDown size={16} className="text-gray-400" />
              </div>
              {showCustomerDropdown && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  <div className="p-2 border-b">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search by name or phone..."
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">No customers found</div>
                  ) : (
                    filteredCustomers.map(c => (
                      <div
                        key={c.id}
                        className="px-4 py-3 hover:bg-green-50 cursor-pointer border-b border-gray-50 last:border-0"
                        onClick={() => {
                          setForm(prev => ({ ...prev, customer_id: c.id }))
                          setShowCustomerDropdown(false)
                          setCustomerSearch('')
                        }}
                      >
                        <p className="font-medium text-gray-800 text-sm">{c.shop_name}</p>
                        <p className="text-xs text-gray-500">{c.owner_name} • {c.phone}</p>
                        {(c.total_purchased_amount - c.total_paid_amount) > 0 && (
                          <p className="text-xs text-red-500">Due: ৳{(c.total_purchased_amount - c.total_paid_amount).toFixed(2)}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Sale Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sale Date *</label>
              <input
                type="date"
                className="input-field"
                value={form.sale_date}
                onChange={e => setForm(prev => ({ ...prev, sale_date: e.target.value }))}
              />
            </div>
          </div>

          {/* Items Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Items *</label>
              <button onClick={addItem} className="flex items-center gap-1 text-sm text-green-700 hover:text-green-800 font-medium">
                <Plus size={16} /> Add Item
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Product</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600">Qty (KG)</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600">Price/KG (৳)</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600">Total (৳)</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {form.items.map(item => {
                    const selectedProd = products.find(p => p.id === item.product_id)
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 min-w-[180px]">
                          <select
                            className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500"
                            value={item.product_id}
                            onChange={e => updateItem(item.id, 'product_id', e.target.value)}
                          >
                            <option value="">Select product...</option>
                            {products.filter(p => p.is_active && p.current_stock_kg > 0).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} (Stock: {p.current_stock_kg.toFixed(1)} KG)
                              </option>
                            ))}
                          </select>
                          {selectedProd && (
                            <p className="text-xs text-gray-400 mt-0.5 pl-1">
                              Available: {selectedProd.current_stock_kg.toFixed(2)} KG
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            max={selectedProd?.current_stock_kg ?? undefined}
                            className={`w-24 text-sm border rounded-md px-2 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-green-500 ${
                              selectedProd && item.quantity_kg > selectedProd.current_stock_kg
                                ? 'border-red-400 bg-red-50'
                                : 'border-gray-200'
                            }`}
                            value={item.quantity_kg || ''}
                            onChange={e => updateItem(item.id, 'quantity_kg', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-28 text-sm border border-gray-200 rounded-md px-2 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                            value={item.price_per_kg || ''}
                            onChange={e => updateItem(item.id, 'price_per_kg', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-medium text-gray-800">
                          ৳{item.total_amount.toFixed(2)}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeItem(item.id)}
                            disabled={form.items.length === 1}
                            className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals & Payment Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Payment details */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  className="input-field"
                  value={form.payment_method}
                  onChange={e => setForm(prev => ({ ...prev, payment_method: e.target.value as PaymentMethod }))}
                >
                  <option value="cash">Cash</option>
                  <option value="credit">Credit (No Payment)</option>
                  <option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Status</label>
                <select
                  className="input-field"
                  value={form.delivery_status}
                  onChange={e => setForm(prev => ({ ...prev, delivery_status: e.target.value as DeliveryStatus }))}
                >
                  <option value="pending">Pending</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  placeholder="Optional notes..."
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>

            {/* Right: Amount Summary */}
            <div className="bg-gray-50 rounded-xl p-5 space-y-3">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span className="font-medium">৳{totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600 whitespace-nowrap">Discount (৳)</span>
                <input
                  type="number"
                  min="0"
                  className="w-32 text-sm border border-gray-200 rounded-md px-2 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={form.discount || ''}
                  onChange={e => setForm(prev => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="flex justify-between text-base font-bold text-gray-800 border-t border-gray-200 pt-2">
                <span>Final Amount</span>
                <span>৳{finalAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600 whitespace-nowrap">Paid Amount (৳)</span>
                <input
                  type="number"
                  min="0"
                  max={finalAmount}
                  className="w-32 text-sm border border-gray-200 rounded-md px-2 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={form.paid_amount || ''}
                  onChange={e => setForm(prev => ({ ...prev, paid_amount: Math.min(finalAmount, parseFloat(e.target.value) || 0) }))}
                />
              </div>
              <div className={`flex justify-between text-base font-bold border-t border-gray-200 pt-2 ${remainingDue > 0 ? 'text-red-600' : 'text-green-700'}`}>
                <span>Remaining Due</span>
                <span>৳{remainingDue.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
            ) : (
              <><ShoppingCart size={16} /> Record Sale</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Sales Page ─────────────────────────────────────────────────────────
export default function Sales() {
  const { partner } = useAuth()
  const [sales, setSales] = useState<SaleWithCustomer[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewSale, setShowNewSale] = useState(false)
  const [printSale, setPrintSale] = useState<SaleWithCustomer | null>(null)
  const [viewSale, setViewSale] = useState<SaleWithCustomer | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'partial' | 'credit'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Stats
  const today = format(new Date(), 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')

  const todaySales = sales.filter(s => s.sale_date === today)
  const todayRevenue = todaySales.reduce((s, sale) => s + sale.final_amount, 0)
  const monthSales = sales.filter(s => s.sale_date >= monthStart && s.sale_date <= monthEnd)
  const monthRevenue = monthSales.reduce((s, sale) => s + sale.final_amount, 0)
  const totalDue = sales.reduce((s, sale) => s + (sale.final_amount - sale.paid_amount), 0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [salesRes, customersRes, productsRes] = await Promise.all([
      supabase
        .from('sales')
        .select(`*, customers(shop_name, owner_name, phone), sale_items(id, product_id, quantity_kg, price_per_kg, cost_per_kg, total_amount, products(name, sku))`)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('customers').select('*').eq('status', 'active').order('shop_name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
    ])
    if (salesRes.data) setSales(salesRes.data as SaleWithCustomer[])
    if (customersRes.data) setCustomers(customersRes.data)
    if (productsRes.data) setProducts(productsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-generate invoice number
  async function generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear()
    const { count } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .like('invoice_number', `SAL-${year}-%`)
    const seq = String((count ?? 0) + 1).padStart(3, '0')
    return `SAL-${year}-${seq}`
  }

  const [nextInvoice, setNextInvoice] = useState('')
  async function openNewSale() {
    const inv = await generateInvoiceNumber()
    setNextInvoice(inv)
    setShowNewSale(true)
  }

  // Filtered sales
  const filteredSales = sales.filter(sale => {
    const status = getPaymentStatus(sale)
    if (statusFilter !== 'all' && status !== statusFilter) return false
    if (dateFrom && sale.sale_date < dateFrom) return false
    if (dateTo && sale.sale_date > dateTo) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const cust = sale.customers
      if (
        !sale.invoice_number.toLowerCase().includes(q) &&
        !cust.shop_name.toLowerCase().includes(q) &&
        !cust.owner_name.toLowerCase().includes(q) &&
        !cust.phone.includes(q)
      ) return false
    }
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Loading sales...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Print Invoice Overlay */}
      {printSale && <PrintInvoice sale={printSale} onClose={() => setPrintSale(null)} />}

      {/* New Sale Modal */}
      {showNewSale && (
        <NewSaleModal
          onClose={() => setShowNewSale(false)}
          onSaved={() => { setShowNewSale(false); fetchData() }}
          customers={customers}
          products={products}
          nextInvoiceNumber={nextInvoice}
        />
      )}

      {/* View Sale Detail Modal */}
      {viewSale && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-xl font-bold text-gray-800">{viewSale.invoice_number}</h2>
                <p className="text-sm text-gray-500">{format(new Date(viewSale.sale_date), 'dd MMM yyyy')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setViewSale(null); setPrintSale(viewSale) }}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Printer size={15} /> Print
                </button>
                <button onClick={() => setViewSale(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-800">{viewSale.customers.shop_name}</p>
                <p className="text-sm text-gray-600">{viewSale.customers.owner_name} • {viewSale.customers.phone}</p>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200">
                  <th className="text-left pb-2 text-gray-600">Product</th>
                  <th className="text-right pb-2 text-gray-600">Qty</th>
                  <th className="text-right pb-2 text-gray-600">Price</th>
                  <th className="text-right pb-2 text-gray-600">Total</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {viewSale.sale_items.map(item => (
                    <tr key={item.id}>
                      <td className="py-2">{item.products.name}</td>
                      <td className="py-2 text-right">{item.quantity_kg} KG</td>
                      <td className="py-2 text-right">৳{item.price_per_kg.toFixed(2)}</td>
                      <td className="py-2 text-right font-medium">৳{item.total_amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>৳{viewSale.total_amount.toFixed(2)}</span></div>
                {viewSale.discount > 0 && <div className="flex justify-between text-sm text-red-600"><span>Discount</span><span>-৳{viewSale.discount.toFixed(2)}</span></div>}
                <div className="flex justify-between font-bold"><span>Final</span><span>৳{viewSale.final_amount.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm text-green-700"><span>Paid</span><span>৳{viewSale.paid_amount.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold text-red-600"><span>Due</span><span>৳{(viewSale.final_amount - viewSale.paid_amount).toFixed(2)}</span></div>
              </div>
              {viewSale.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-gray-700">
                  <span className="font-medium">Notes: </span>{viewSale.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Sales Management</h1>
          <p className="page-subtitle">Manage invoices, track payments and delivery status</p>
        </div>
        <button onClick={openNewSale} className="btn-primary flex items-center gap-2 self-start sm:self-auto">
          <Plus size={18} /> New Sale
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-600">Today's Sales</p>
            <div className="p-2 bg-green-100 rounded-lg"><ShoppingCart size={18} className="text-green-700" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-800">৳{todayRevenue.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">{todaySales.length} invoice{todaySales.length !== 1 ? 's' : ''} today</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-600">This Month Revenue</p>
            <div className="p-2 bg-blue-100 rounded-lg"><TrendingUp size={18} className="text-blue-700" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-800">৳{monthRevenue.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">{monthSales.length} sales this month</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-600">Total Invoices</p>
            <div className="p-2 bg-purple-100 rounded-lg"><FileText size={18} className="text-purple-700" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-800">{sales.length}</p>
          <p className="text-xs text-gray-500 mt-1">All time invoices</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-600">Pending Dues</p>
            <div className="p-2 bg-red-100 rounded-lg"><AlertCircle size={18} className="text-red-600" /></div>
          </div>
          <p className="text-2xl font-bold text-red-600">৳{totalDue.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total outstanding</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by invoice, customer, phone..."
              className="input-field pl-10"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <input
              type="date"
              className="input-field w-auto"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              title="From date"
            />
            <input
              type="date"
              className="input-field w-auto"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              title="To date"
            />
            <select
              className="input-field w-auto"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="credit">Credit</option>
            </select>
            {(searchQuery || dateFrom || dateTo || statusFilter !== 'all') && (
              <button
                className="btn-secondary text-sm"
                onClick={() => { setSearchQuery(''); setDateFrom(''); setDateTo(''); setStatusFilter('all') }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Showing {filteredSales.length} of {sales.length} sales
        </p>
      </div>

      {/* Sales Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="table-header">Invoice #</th>
              <th className="table-header">Customer</th>
              <th className="table-header">Date</th>
              <th className="table-header text-right">Items</th>
              <th className="table-header text-right">Total</th>
              <th className="table-header text-right">Discount</th>
              <th className="table-header text-right">Final</th>
              <th className="table-header text-right">Paid</th>
              <th className="table-header text-right">Due</th>
              <th className="table-header text-center">Status</th>
              <th className="table-header text-center">Delivery</th>
              <th className="table-header text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredSales.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-12 text-gray-400">
                  <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No sales found</p>
                </td>
              </tr>
            ) : (
              filteredSales.map(sale => {
                const status = getPaymentStatus(sale)
                const due = sale.final_amount - sale.paid_amount
                return (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">
                      <span className="font-semibold text-green-700 text-sm">{sale.invoice_number}</span>
                    </td>
                    <td className="table-cell">
                      <p className="font-medium text-gray-800 text-sm">{sale.customers.shop_name}</p>
                      <p className="text-xs text-gray-500">{sale.customers.phone}</p>
                    </td>
                    <td className="table-cell text-sm text-gray-600 whitespace-nowrap">
                      {format(new Date(sale.sale_date), 'dd MMM yyyy')}
                    </td>
                    <td className="table-cell text-right text-sm text-gray-600">
                      {sale.sale_items.length}
                    </td>
                    <td className="table-cell text-right text-sm">৳{sale.total_amount.toLocaleString()}</td>
                    <td className="table-cell text-right text-sm text-red-600">
                      {sale.discount > 0 ? `-৳${sale.discount.toLocaleString()}` : '—'}
                    </td>
                    <td className="table-cell text-right font-semibold text-sm">৳{sale.final_amount.toLocaleString()}</td>
                    <td className="table-cell text-right text-sm text-green-700">৳{sale.paid_amount.toLocaleString()}</td>
                    <td className={`table-cell text-right font-semibold text-sm ${due > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {due > 0 ? `৳${due.toLocaleString()}` : '—'}
                    </td>
                    <td className="table-cell text-center">
                      {status === 'paid' && <span className="badge-green">Paid</span>}
                      {status === 'partial' && <span className="badge-yellow">Partial</span>}
                      {status === 'credit' && <span className="badge-red">Credit</span>}
                    </td>
                    <td className="table-cell text-center">
                      {sale.delivery_status === 'delivered' && <span className="badge-green">Delivered</span>}
                      {sale.delivery_status === 'pending' && <span className="badge-yellow">Pending</span>}
                      {sale.delivery_status === 'cancelled' && <span className="badge-red">Cancelled</span>}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setViewSale(sale)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          title="View Details"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => setPrintSale(sale)}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                          title="Print Invoice"
                        >
                          <Printer size={15} />
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
    </div>
  )
}
