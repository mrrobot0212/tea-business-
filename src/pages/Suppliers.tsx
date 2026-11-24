import React, { useEffect, useState, useCallback } from 'react'
import {
  Users,
  UserCheck,
  AlertCircle,
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Phone,
  MapPin,
  Package,
  TrendingUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface Supplier {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  address: string | null
  notes: string | null
  total_purchased: number
  total_paid: number
  is_active: boolean
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

interface SupplierForm {
  name: string
  contact_person: string
  phone: string
  address: string
  notes: string
  is_active: boolean
}

const EMPTY_FORM: SupplierForm = {
  name: '',
  contact_person: '',
  phone: '',
  address: '',
  notes: '',
  is_active: true,
}

const fmt = (n: number) =>
  '৳' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export default function Suppliers() {
  const { partner } = useAuth()

  // ── List state ──────────────────────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterDue, setFilterDue] = useState<'all' | 'has_due' | 'no_due'>('all')

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // ── Delete confirmation state ────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Summary cards data ───────────────────────────────────────────────────────
  const totalPurchased = suppliers.reduce((s, sup) => s + sup.total_purchased, 0)
  const totalOutstanding = suppliers.reduce(
    (s, sup) => s + (sup.total_purchased - sup.total_paid),
    0
  )
  const activeCount = suppliers.filter((sup) => sup.is_active).length

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })
    if (error) {
      toast.error('Failed to load suppliers')
    } else {
      setSuppliers((data as Supplier[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = suppliers.filter((sup) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      sup.name.toLowerCase().includes(q) ||
      (sup.contact_person ?? '').toLowerCase().includes(q) ||
      (sup.phone ?? '').includes(q) ||
      (sup.address ?? '').toLowerCase().includes(q)
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && sup.is_active) ||
      (filterStatus === 'inactive' && !sup.is_active)
    const outstanding = sup.total_purchased - sup.total_paid
    const matchDue =
      filterDue === 'all' ||
      (filterDue === 'has_due' && outstanding > 0) ||
      (filterDue === 'no_due' && outstanding <= 0)
    return matchSearch && matchStatus && matchDue
  })

  // ── Form handlers ────────────────────────────────────────────────────────────
  const openAddModal = () => {
    setEditingSupplier(null)
    setForm(EMPTY_FORM)
    setShowFormModal(true)
  }

  const openEditModal = (sup: Supplier) => {
    setEditingSupplier(sup)
    setForm({
      name: sup.name,
      contact_person: sup.contact_person ?? '',
      phone: sup.phone ?? '',
      address: sup.address ?? '',
      notes: sup.notes ?? '',
      is_active: sup.is_active,
    })
    setShowFormModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partner) return
    setSaving(true)
    try {
      if (editingSupplier) {
        const { error } = await supabase
          .from('suppliers')
          .update({
            name: form.name,
            contact_person: form.contact_person || null,
            phone: form.phone || null,
            address: form.address || null,
            notes: form.notes || null,
            is_active: form.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingSupplier.id)
        if (error) throw error
        toast.success('Supplier updated')
      } else {
        const { error } = await supabase.from('suppliers').insert({
          name: form.name,
          contact_person: form.contact_person || null,
          phone: form.phone || null,
          address: form.address || null,
          notes: form.notes || null,
          is_active: form.is_active,
          created_by: partner.id,
        })
        if (error) throw error
        toast.success('Supplier added')
      }
      setShowFormModal(false)
      fetchSuppliers()
    } catch (err: any) {
      toast.error(err.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete handler ────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('suppliers').delete().eq('id', deleteTarget.id)
      if (error) throw error
      toast.success('Supplier deleted')
      setDeleteTarget(null)
      fetchSuppliers()
    } catch (err: any) {
      toast.error(err.message ?? 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  const renderSkeleton = () => (
    <div className="p-6 space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="animate-pulse flex items-center gap-4">
          <div className="h-4 bg-gray-200 rounded w-1/4" />
          <div className="h-4 bg-gray-200 rounded w-1/6" />
          <div className="h-4 bg-gray-200 rounded w-1/6" />
          <div className="h-4 bg-gray-200 rounded w-1/6" />
          <div className="h-4 bg-gray-200 rounded w-1/8" />
          <div className="h-4 bg-gray-200 rounded w-1/8" />
        </div>
      ))}
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Supplier Management</h1>
          <p className="page-subtitle">Manage your tea suppliers and their accounts</p>
        </div>
        <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Add Supplier
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Suppliers</span>
            <Package size={20} className="text-primary-600" />
          </div>
          <div className="text-2xl font-bold text-gray-800">{suppliers.length}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Active Suppliers</span>
            <UserCheck size={20} className="text-green-500" />
          </div>
          <div className="text-2xl font-bold text-gray-800">{activeCount}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Purchased</span>
            <TrendingUp size={20} className="text-blue-500" />
          </div>
          <div className="text-xl font-bold text-gray-800">{fmt(totalPurchased)}</div>
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
              placeholder="Search supplier name, contact, phone, address…"
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
          renderSkeleton()
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            {suppliers.length === 0 ? (
              <div className="space-y-3">
                <Package size={48} className="mx-auto text-gray-300" />
                <p className="text-lg font-medium text-gray-500">No suppliers yet</p>
                <p className="text-sm text-gray-400">
                  Add your first supplier to start tracking purchases and payments.
                </p>
                <button onClick={openAddModal} className="btn-primary mt-2">
                  <Plus size={16} className="inline mr-1" /> Add First Supplier
                </button>
              </div>
            ) : (
              'No suppliers match your search or filters.'
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="table-header">Supplier Name</th>
                  <th className="table-header">Contact Person</th>
                  <th className="table-header">Phone</th>
                  <th className="table-header text-right">Total Purchased</th>
                  <th className="table-header text-right">Total Paid</th>
                  <th className="table-header text-right">Outstanding Due</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((sup) => {
                  const outstanding = sup.total_purchased - sup.total_paid
                  return (
                    <tr key={sup.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium text-gray-900">{sup.name}</td>
                      <td className="table-cell text-gray-700">
                        {sup.contact_person ?? '—'}
                      </td>
                      <td className="table-cell text-gray-600">{sup.phone ?? '—'}</td>
                      <td className="table-cell text-right font-medium">
                        {fmt(sup.total_purchased)}
                      </td>
                      <td className="table-cell text-right text-green-700">
                        {fmt(sup.total_paid)}
                      </td>
                      <td className="table-cell text-right">
                        {outstanding > 0 ? (
                          <span className="badge-red">{fmt(outstanding)}</span>
                        ) : (
                          <span className="badge-green">Cleared</span>
                        )}
                      </td>
                      <td className="table-cell">
                        {sup.is_active ? (
                          <span className="badge-green">Active</span>
                        ) : (
                          <span className="badge-gray">Inactive</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(sup)}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(sup)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
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
          Add / Edit Supplier Modal
      ════════════════════════════════════════════════════════════════════════════ */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
              </h2>
              <button onClick={() => setShowFormModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supplier Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input-field"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    placeholder="e.g. Sylhet Tea Garden"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Person
                  </label>
                  <input
                    className="input-field"
                    value={form.contact_person}
                    onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                    placeholder="Contact person's name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    className="input-field"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="01XXXXXXXXX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    className="input-field"
                    value={form.is_active ? 'active' : 'inactive'}
                    onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })}
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
                  placeholder="Full supplier address"
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
                  {saving ? 'Saving…' : editingSupplier ? 'Update Supplier' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          Delete Confirmation Dialog
      ════════════════════════════════════════════════════════════════════════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Supplier</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm text-gray-700 mb-1">
                Are you sure you want to delete{' '}
                <span className="font-semibold">{deleteTarget.name}</span>?
              </p>
              {deleteTarget.total_purchased > 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
                  This supplier has {fmt(deleteTarget.total_purchased)} in purchase records.
                  Deleting will remove the supplier record only.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button
                onClick={() => setDeleteTarget(null)}
                className="btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-danger"
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
