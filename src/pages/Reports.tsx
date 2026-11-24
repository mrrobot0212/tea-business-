import { useState, useEffect, useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  subMonths,
  parseISO,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  eachWeekOfInterval,
} from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import {
  FileText,
  Download,
  Calendar,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Receipt,
  RefreshCw,
  Users,
  Truck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../lib/database.types'

// ─── Types ───────────────────────────────────────────────────────────────────

type DatePreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom'

interface TopCustomer {
  id: string
  shop_name: string
  owner_name: string
  total_sales: number
}

interface TopSupplier {
  id: string
  name: string
  total_purchases: number
}

interface DailySalesPoint {
  label: string
  revenue: number
}

interface ProfitLoss {
  revenue: number
  cogs: number
  grossProfit: number
  expensesByCategory: { category: string; amount: number }[]
  totalExpenses: number
  netProfit: number
}

interface CustomerDue {
  id: string
  shop_name: string
  owner_name: string
  due_amount: number
}

interface SupplierDue {
  id: string
  name: string
  due_amount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (amount: number) => `৳${amount.toLocaleString('en-IN')}`

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 bg-gray-200 rounded w-28" />
        <div className="h-10 w-10 bg-gray-200 rounded-lg" />
      </div>
      <div className="h-7 bg-gray-200 rounded w-36 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-24" />
    </div>
  )
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded" />
      ))}
    </div>
  )
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  bgColor: string
  textColor: string
  iconBg: string
  iconColor: string
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  bgColor,
  textColor,
  iconBg,
  iconColor,
}: StatCardProps) {
  return (
    <div className={`${bgColor} rounded-xl p-5 shadow-sm border border-opacity-30 border-gray-200`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${textColor} opacity-80 truncate`}>{title}</p>
          <p className={`text-xl font-bold ${textColor} mt-1 truncate`}>{value}</p>
          {subtitle && (
            <p className={`text-xs ${textColor} opacity-60 mt-1`}>{subtitle}</p>
          )}
        </div>
        <div className={`${iconBg} ${iconColor} p-2.5 rounded-lg ml-3 flex-shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="text-sm font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {fmt(entry.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Pie Chart Colors ────────────────────────────────────────────────────────

const PIE_COLORS = ['#15803d', '#f97316', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#eab308']

// ─── Reports ─────────────────────────────────────────────────────────────────

export default function Reports() {
  const { partner } = useAuth()

  // Date range state
  const [preset, setPreset] = useState<DatePreset>('this_month')
  const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  // Data state
  const [totalSales, setTotalSales] = useState(0)
  const [totalPurchases, setTotalPurchases] = useState(0)
  const [totalExpenses, setTotalExpenses] = useState(0)
  const [netProfit, setNetProfit] = useState(0)
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [topSuppliers, setTopSuppliers] = useState<TopSupplier[]>([])
  const [dailySales, setDailySales] = useState<DailySalesPoint[]>([])
  const [profitLoss, setProfitLoss] = useState<ProfitLoss | null>(null)
  const [customerDues, setCustomerDues] = useState<CustomerDue[]>([])
  const [supplierDues, setSupplierDues] = useState<SupplierDue[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)

  // ── Date Preset Handler ──────────────────────────────────────────────────

  const applyPreset = useCallback((p: DatePreset) => {
    setPreset(p)
    const now = new Date()
    switch (p) {
      case 'today':
        setStartDate(format(startOfDay(now), 'yyyy-MM-dd'))
        setEndDate(format(endOfDay(now), 'yyyy-MM-dd'))
        break
      case 'this_week':
        setStartDate(format(startOfWeek(now, { weekStartsOn: 6 }), 'yyyy-MM-dd'))
        setEndDate(format(endOfWeek(now, { weekStartsOn: 6 }), 'yyyy-MM-dd'))
        break
      case 'this_month':
        setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'))
        setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'))
        break
      case 'last_month':
        const lastMonth = subMonths(now, 1)
        setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'))
        setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'))
        break
      case 'this_year':
        setStartDate(format(startOfYear(now), 'yyyy-MM-dd'))
        setEndDate(format(endOfYear(now), 'yyyy-MM-dd'))
        break
      case 'custom':
        break
    }
  }, [])

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchReportsData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    try {
      const rangeStart = startDate
      const rangeEnd = endDate

      // Parallel fetches
      const [
        salesRes,
        saleItemsRes,
        purchasesRes,
        expensesRes,
        customersRes,
        suppliersRes,
      ] = await Promise.all([
        supabase
          .from('sales')
          .select(`
            id,
            invoice_number,
            customer_id,
            sale_date,
            final_amount,
            paid_amount,
            customers ( id, shop_name, owner_name )
          `)
          .gte('sale_date', rangeStart)
          .lte('sale_date', rangeEnd),
        supabase
          .from('sale_items')
          .select(`
            id,
            sale_id,
            quantity_kg,
            price_per_kg,
            cost_per_kg,
            total_amount,
            sales!inner ( sale_date )
          `)
          .gte('sales.sale_date', rangeStart)
          .lte('sales.sale_date', rangeEnd),
        supabase
          .from('purchases')
          .select(`
            id,
            invoice_number,
            supplier_id,
            purchase_date,
            total_amount,
            total_landed_cost,
            amount_paid,
            suppliers ( id, name )
          `)
          .gte('purchase_date', rangeStart)
          .lte('purchase_date', rangeEnd),
        supabase
          .from('expenses')
          .select('id, date, category, amount, description')
          .gte('date', rangeStart)
          .lte('date', rangeEnd),
        supabase
          .from('customers')
          .select('id, shop_name, owner_name, total_purchased_amount, total_paid_amount'),
        supabase
          .from('suppliers')
          .select('id, name, total_purchased, total_paid'),
      ])

      const sales = (salesRes.data ?? []) as any[]
      const saleItems = (saleItemsRes.data ?? []) as any[]
      const purchases = (purchasesRes.data ?? []) as any[]
      const expenses = expensesRes.data ?? []
      const customers = customersRes.data ?? []
      const suppliers = suppliersRes.data ?? []

      // ── Summary Stats ────────────────────────────────────────────────────

      const salesTotal = sales.reduce((s, r) => s + (r.final_amount ?? 0), 0)
      const purchasesTotal = purchases.reduce((s, r) => s + (r.total_landed_cost ?? r.total_amount ?? 0), 0)
      const expensesTotal = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)

      setTotalSales(salesTotal)
      setTotalPurchases(purchasesTotal)
      setTotalExpenses(expensesTotal)

      // ── Top Customers by Sales ────────────────────────────────────────────

      const customerMap = new Map<string, { id: string; shop_name: string; owner_name: string; total: number }>()
      sales.forEach(s => {
        const cust = s.customers as any
        if (!cust) return
        const key = cust.id
        const existing = customerMap.get(key)
        if (existing) {
          existing.total += s.final_amount ?? 0
        } else {
          customerMap.set(key, {
            id: cust.id,
            shop_name: cust.shop_name ?? 'Unknown',
            owner_name: cust.owner_name ?? '',
            total: s.final_amount ?? 0,
          })
        }
      })
      const topCust = Array.from(customerMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
        .map(c => ({ id: c.id, shop_name: c.shop_name, owner_name: c.owner_name, total_sales: c.total }))
      setTopCustomers(topCust)

      // ── Top Suppliers by Purchase ─────────────────────────────────────────

      const supplierMap = new Map<string, { id: string; name: string; total: number }>()
      purchases.forEach(p => {
        const sup = p.suppliers as any
        if (!sup) return
        const key = sup.id
        const existing = supplierMap.get(key)
        if (existing) {
          existing.total += p.total_landed_cost ?? p.total_amount ?? 0
        } else {
          supplierMap.set(key, {
            id: sup.id,
            name: sup.name ?? 'Unknown',
            total: p.total_landed_cost ?? p.total_amount ?? 0,
          })
        }
      })
      const topSup = Array.from(supplierMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
        .map(s => ({ id: s.id, name: s.name, total_purchases: s.total }))
      setTopSuppliers(topSup)

      // ── Daily/Weekly Sales Chart ──────────────────────────────────────────

      const start = parseISO(rangeStart)
      const end = parseISO(rangeEnd)
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

      let chartData: DailySalesPoint[] = []

      if (daysDiff <= 31) {
        // Daily view
        const days = eachDayOfInterval({ start, end })
        const dayMap = new Map<string, number>()
        days.forEach(d => dayMap.set(format(d, 'yyyy-MM-dd'), 0))
        sales.forEach(s => {
          const key = s.sale_date?.substring(0, 10)
          if (key && dayMap.has(key)) {
            dayMap.set(key, (dayMap.get(key) ?? 0) + (s.final_amount ?? 0))
          }
        })
        chartData = days.map(d => ({
          label: format(d, 'dd MMM'),
          revenue: dayMap.get(format(d, 'yyyy-MM-dd')) ?? 0,
        }))
      } else {
        // Weekly view
        const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 6 })
        const weekMap = new Map<string, number>()
        weeks.forEach(w => weekMap.set(format(w, 'yyyy-MM-dd'), 0))
        sales.forEach(s => {
          const saleDate = parseISO(s.sale_date)
          const weekStart = startOfWeek(saleDate, { weekStartsOn: 6 })
          const key = format(weekStart, 'yyyy-MM-dd')
          if (weekMap.has(key)) {
            weekMap.set(key, (weekMap.get(key) ?? 0) + (s.final_amount ?? 0))
          }
        })
        chartData = weeks.map(w => ({
          label: `W ${format(w, 'dd MMM')}`,
          revenue: weekMap.get(format(w, 'yyyy-MM-dd')) ?? 0,
        }))
      }
      setDailySales(chartData)

      // ── Profit & Loss ─────────────────────────────────────────────────────

      const revenue = salesTotal
      const cogs = saleItems.reduce(
        (s, si) => s + (si.quantity_kg ?? 0) * (si.cost_per_kg ?? 0),
        0
      )
      const grossProfit = revenue - cogs

      // Expenses breakdown by category
      const categoryMap = new Map<string, number>()
      expenses.forEach(e => {
        const cat = e.category ?? 'Uncategorized'
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + (e.amount ?? 0))
      })
      const expensesByCategory = Array.from(categoryMap.entries())
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount)

      const pnl: ProfitLoss = {
        revenue,
        cogs,
        grossProfit,
        expensesByCategory,
        totalExpenses: expensesTotal,
        netProfit: grossProfit - expensesTotal,
      }
      setProfitLoss(pnl)
      setNetProfit(pnl.netProfit)

      // ── Outstanding Dues (all-time, not date-filtered) ────────────────────

      const custDues = customers
        .map(c => ({
          id: c.id,
          shop_name: c.shop_name,
          owner_name: c.owner_name,
          due_amount: Math.max(0, (c.total_purchased_amount ?? 0) - (c.total_paid_amount ?? 0)),
        }))
        .filter(c => c.due_amount > 0)
        .sort((a, b) => b.due_amount - a.due_amount)
        .slice(0, 10)
      setCustomerDues(custDues)

      const supDues = suppliers
        .map(s => ({
          id: s.id,
          name: s.name,
          due_amount: Math.max(0, (s.total_purchased ?? 0) - (s.total_paid ?? 0)),
        }))
        .filter(s => s.due_amount > 0)
        .sort((a, b) => b.due_amount - a.due_amount)
        .slice(0, 10)
      setSupplierDues(supDues)
    } catch (err) {
      console.error('Reports fetch error:', err)
      toast.error('Failed to load reports data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchReportsData()
  }, [fetchReportsData])

  // ── Export to PDF ──────────────────────────────────────────────────────────

  const exportToPDF = useCallback(() => {
    setExporting(true)
    try {
      const doc = new jsPDF()
      const rangeLabel = `${format(parseISO(startDate), 'dd MMM yyyy')} — ${format(parseISO(endDate), 'dd MMM yyyy')}`

      // Title
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('TeaLedger — Business Report', 14, 20)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Period: ${rangeLabel}`, 14, 28)
      doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 14, 34)

      // Summary
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Summary', 14, 46)
      autoTable(doc, {
        startY: 50,
        head: [['Metric', 'Amount (BDT)']],
        body: [
          ['Total Sales', totalSales.toLocaleString('en-IN')],
          ['Total Purchases', totalPurchases.toLocaleString('en-IN')],
          ['Total Expenses', totalExpenses.toLocaleString('en-IN')],
          ['Net Profit', netProfit.toLocaleString('en-IN')],
        ],
        theme: 'grid',
        headStyles: { fillColor: [21, 128, 61] },
      })

      // Top Customers
      let y = (doc as any).lastAutoTable?.finalY ?? 90
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Top Customers by Sales', 14, y + 12)
      autoTable(doc, {
        startY: y + 16,
        head: [['#', 'Shop Name', 'Owner', 'Sales (BDT)']],
        body: topCustomers.map((c, i) => [
          i + 1,
          c.shop_name,
          c.owner_name,
          c.total_sales.toLocaleString('en-IN'),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [21, 128, 61] },
      })

      // Top Suppliers
      y = (doc as any).lastAutoTable?.finalY ?? 150
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Top Suppliers by Purchases', 14, y + 12)
      autoTable(doc, {
        startY: y + 16,
        head: [['#', 'Supplier', 'Purchases (BDT)']],
        body: topSuppliers.map((s, i) => [
          i + 1,
          s.name,
          s.total_purchases.toLocaleString('en-IN'),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [21, 128, 61] },
      })

      // Profit & Loss
      if (profitLoss) {
        y = (doc as any).lastAutoTable?.finalY ?? 200
        if (y > 240) {
          doc.addPage()
          y = 10
        }
        doc.setFontSize(13)
        doc.setFont('helvetica', 'bold')
        doc.text('Profit & Loss Statement', 14, y + 12)

        const plRows: (string | number)[][] = [
          ['Revenue (Sales)', profitLoss.revenue.toLocaleString('en-IN')],
          ['Cost of Goods Sold (COGS)', `(${profitLoss.cogs.toLocaleString('en-IN')})`],
          ['Gross Profit', profitLoss.grossProfit.toLocaleString('en-IN')],
          ['', ''],
          ...profitLoss.expensesByCategory.map(e => [`  ${e.category}`, `(${e.amount.toLocaleString('en-IN')})`]),
          ['Total Expenses', `(${profitLoss.totalExpenses.toLocaleString('en-IN')})`],
          ['', ''],
          ['Net Profit', profitLoss.netProfit.toLocaleString('en-IN')],
        ]
        autoTable(doc, {
          startY: y + 16,
          head: [['Item', 'Amount (BDT)']],
          body: plRows,
          theme: 'grid',
          headStyles: { fillColor: [21, 128, 61] },
        })
      }

      // Outstanding Dues
      y = (doc as any).lastAutoTable?.finalY ?? 200
      if (y > 220) {
        doc.addPage()
        y = 10
      }
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Outstanding Customer Dues', 14, y + 12)
      autoTable(doc, {
        startY: y + 16,
        head: [['#', 'Shop Name', 'Owner', 'Due (BDT)']],
        body: customerDues.map((c, i) => [
          i + 1,
          c.shop_name,
          c.owner_name,
          c.due_amount.toLocaleString('en-IN'),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [21, 128, 61] },
      })

      y = (doc as any).lastAutoTable?.finalY ?? 200
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Outstanding Supplier Dues', 14, y + 12)
      autoTable(doc, {
        startY: y + 16,
        head: [['#', 'Supplier', 'Due (BDT)']],
        body: supplierDues.map((s, i) => [
          i + 1,
          s.name,
          s.due_amount.toLocaleString('en-IN'),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [21, 128, 61] },
      })

      doc.save(`TeaLedger_Report_${startDate}_to_${endDate}.pdf`)
      toast.success('PDF report exported successfully')
    } catch (err) {
      console.error('PDF export error:', err)
      toast.error('Failed to export PDF')
    } finally {
      setExporting(false)
    }
  }, [startDate, endDate, totalSales, totalPurchases, totalExpenses, netProfit, topCustomers, topSuppliers, profitLoss, customerDues, supplierDues])

  // ── Export to Excel ────────────────────────────────────────────────────────

  const exportToExcel = useCallback(() => {
    setExporting(true)
    try {
      const wb = XLSX.utils.book_new()

      // Summary sheet
      const summaryData = [
        { Metric: 'Total Sales', 'Amount (BDT)': totalSales },
        { Metric: 'Total Purchases', 'Amount (BDT)': totalPurchases },
        { Metric: 'Total Expenses', 'Amount (BDT)': totalExpenses },
        { Metric: 'Net Profit', 'Amount (BDT)': netProfit },
      ]
      const summarySheet = XLSX.utils.json_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

      // Top Customers sheet
      const custData = topCustomers.map((c, i) => ({
        '#': i + 1,
        'Shop Name': c.shop_name,
        Owner: c.owner_name,
        'Sales (BDT)': c.total_sales,
      }))
      const custSheet = XLSX.utils.json_to_sheet(custData)
      XLSX.utils.book_append_sheet(wb, custSheet, 'Top Customers')

      // Top Suppliers sheet
      const supData = topSuppliers.map((s, i) => ({
        '#': i + 1,
        Supplier: s.name,
        'Purchases (BDT)': s.total_purchases,
      }))
      const supSheet = XLSX.utils.json_to_sheet(supData)
      XLSX.utils.book_append_sheet(wb, supSheet, 'Top Suppliers')

      // P&L sheet
      if (profitLoss) {
        const plData = [
          { Item: 'Revenue (Sales)', 'Amount (BDT)': profitLoss.revenue },
          { Item: 'Cost of Goods Sold (COGS)', 'Amount (BDT)': -profitLoss.cogs },
          { Item: 'Gross Profit', 'Amount (BDT)': profitLoss.grossProfit },
          { Item: '', 'Amount (BDT)': '' as any },
          ...profitLoss.expensesByCategory.map(e => ({
            Item: `  ${e.category}`,
            'Amount (BDT)': -e.amount,
          })),
          { Item: 'Total Expenses', 'Amount (BDT)': -profitLoss.totalExpenses },
          { Item: '', 'Amount (BDT)': '' as any },
          { Item: 'Net Profit', 'Amount (BDT)': profitLoss.netProfit },
        ]
        const plSheet = XLSX.utils.json_to_sheet(plData)
        XLSX.utils.book_append_sheet(wb, plSheet, 'Profit & Loss')
      }

      // Customer Dues sheet
      const custDuesData = customerDues.map((c, i) => ({
        '#': i + 1,
        'Shop Name': c.shop_name,
        Owner: c.owner_name,
        'Due (BDT)': c.due_amount,
      }))
      const custDuesSheet = XLSX.utils.json_to_sheet(custDuesData)
      XLSX.utils.book_append_sheet(wb, custDuesSheet, 'Customer Dues')

      // Supplier Dues sheet
      const supDuesData = supplierDues.map((s, i) => ({
        '#': i + 1,
        Supplier: s.name,
        'Due (BDT)': s.due_amount,
      }))
      const supDuesSheet = XLSX.utils.json_to_sheet(supDuesData)
      XLSX.utils.book_append_sheet(wb, supDuesSheet, 'Supplier Dues')

      XLSX.writeFile(wb, `TeaLedger_Report_${startDate}_to_${endDate}.xlsx`)
      toast.success('Excel report exported successfully')
    } catch (err) {
      console.error('Excel export error:', err)
      toast.error('Failed to export Excel')
    } finally {
      setExporting(false)
    }
  }, [startDate, endDate, totalSales, totalPurchases, totalExpenses, netProfit, topCustomers, topSuppliers, profitLoss, customerDues, supplierDues])

  // ─── Date Preset Buttons ──────────────────────────────────────────────────

  const presets: { key: DatePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'this_week', label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'this_year', label: 'This Year' },
    { key: 'custom', label: 'Custom' },
  ]

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">
            Business insights · {format(parseISO(startDate), 'dd MMM yyyy')} — {format(parseISO(endDate), 'dd MMM yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToPDF()}
            disabled={loading || exporting}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <FileText size={15} />
            PDF
          </button>
          <button
            onClick={() => exportToExcel()}
            disabled={loading || exporting}
            className="btn-primary flex items-center gap-2 text-sm !bg-emerald-700 hover:!bg-emerald-800"
          >
            <Download size={15} />
            Excel
          </button>
          <button
            onClick={() => fetchReportsData(true)}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Calendar size={16} />
            Date Range
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  preset === p.key
                    ? 'bg-primary-700 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="input-field !w-auto text-xs"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="input-field !w-auto text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Total Sales"
              value={fmt(totalSales)}
              subtitle="Revenue in period"
              icon={<TrendingUp size={20} />}
              bgColor="bg-green-50"
              textColor="text-green-700"
              iconBg="bg-green-100"
              iconColor="text-green-600"
            />
            <StatCard
              title="Total Purchases"
              value={fmt(totalPurchases)}
              subtitle="Cost in period"
              icon={<ShoppingCart size={20} />}
              bgColor="bg-orange-50"
              textColor="text-orange-700"
              iconBg="bg-orange-100"
              iconColor="text-orange-600"
            />
            <StatCard
              title="Total Expenses"
              value={fmt(totalExpenses)}
              subtitle="Expenses in period"
              icon={<Receipt size={20} />}
              bgColor="bg-blue-50"
              textColor="text-blue-700"
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
            />
            <StatCard
              title="Net Profit"
              value={fmt(netProfit)}
              subtitle="Revenue − COGS − Expenses"
              icon={<DollarSign size={20} />}
              bgColor={netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
              textColor={netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}
              iconBg={netProfit >= 0 ? 'bg-emerald-100' : 'bg-red-100'}
              iconColor={netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
            />
          </>
        )}
      </div>

      {/* ── Sales Report Section ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Sales Bar Chart */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            Sales Trend — {dailySales.length <= 31 ? 'Daily' : 'Weekly'}
          </h2>
          {loading ? (
            <div className="h-56 bg-gray-100 animate-pulse rounded-lg" />
          ) : dailySales.every(d => d.revenue === 0) ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
              No sales data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailySales} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => `৳${(v / 1000).toFixed(0)}k`}
                  width={52}
                />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="#15803d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Customers Table */}
        <div className="card overflow-hidden">
          <h2 className="text-base font-semibold text-gray-800 mb-4 px-1">
            Top Customers by Sales
          </h2>
          {loading ? (
            <SkeletonTable rows={5} />
          ) : topCustomers.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No sales in this period</div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">#</th>
                    <th className="table-header">Shop Name</th>
                    <th className="table-header">Owner</th>
                    <th className="table-header">Sales Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {topCustomers.map((c, idx) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell text-gray-500 font-medium">{idx + 1}</td>
                      <td className="table-cell font-semibold text-gray-800">{c.shop_name}</td>
                      <td className="table-cell text-gray-600">{c.owner_name}</td>
                      <td className="table-cell font-bold text-green-700">{fmt(c.total_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Purchase Report Section ── */}
      <div className="card overflow-hidden">
        <h2 className="text-base font-semibold text-gray-800 mb-4 px-1">
          Top Suppliers by Purchases
        </h2>
        {loading ? (
          <SkeletonTable rows={5} />
        ) : topSuppliers.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No purchases in this period</div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">#</th>
                  <th className="table-header">Supplier</th>
                  <th className="table-header">Purchase Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topSuppliers.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell text-gray-500 font-medium">{idx + 1}</td>
                    <td className="table-cell font-semibold text-gray-800">{s.name}</td>
                    <td className="table-cell font-bold text-orange-600">{fmt(s.total_purchases)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Profit & Loss Section ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            Profit & Loss Statement
          </h2>
          {loading ? (
            <SkeletonTable rows={8} />
          ) : !profitLoss ? (
            <div className="text-center py-10 text-gray-400 text-sm">No data available</div>
          ) : (
            <div className="space-y-1">
              {/* Revenue */}
              <div className="flex justify-between items-center py-2.5 px-3 bg-green-50 rounded-lg">
                <span className="text-sm font-semibold text-green-800">Revenue (Sales)</span>
                <span className="text-sm font-bold text-green-700">{fmt(profitLoss.revenue)}</span>
              </div>
              {/* COGS */}
              <div className="flex justify-between items-center py-2.5 px-3 bg-red-50 rounded-lg">
                <span className="text-sm font-medium text-red-700">Cost of Goods Sold (COGS)</span>
                <span className="text-sm font-semibold text-red-600">({fmt(profitLoss.cogs)})</span>
              </div>
              {/* Gross Profit */}
              <div className="flex justify-between items-center py-2.5 px-3 bg-blue-50 rounded-lg border border-blue-100">
                <span className="text-sm font-bold text-blue-800">Gross Profit</span>
                <span className={`text-sm font-bold ${profitLoss.grossProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  {fmt(profitLoss.grossProfit)}
                </span>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 my-2" />

              {/* Expenses breakdown */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 pt-1">Expenses</p>
              {profitLoss.expensesByCategory.length === 0 ? (
                <div className="text-center py-4 text-gray-400 text-xs">No expenses recorded</div>
              ) : (
                profitLoss.expensesByCategory.map(e => (
                  <div key={e.category} className="flex justify-between items-center py-2 px-3 hover:bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700">{e.category}</span>
                    <span className="text-sm text-gray-600">({fmt(e.amount)})</span>
                  </div>
                ))
              )}

              {/* Total Expenses */}
              <div className="flex justify-between items-center py-2.5 px-3 bg-gray-100 rounded-lg">
                <span className="text-sm font-semibold text-gray-700">Total Expenses</span>
                <span className="text-sm font-semibold text-gray-600">({fmt(profitLoss.totalExpenses)})</span>
              </div>

              {/* Divider */}
              <div className="border-t-2 border-gray-300 my-2" />

              {/* Net Profit */}
              <div className={`flex justify-between items-center py-3 px-3 rounded-lg border-2 ${
                profitLoss.netProfit >= 0
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <span className={`text-base font-bold ${profitLoss.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                  Net Profit
                </span>
                <span className={`text-base font-bold ${profitLoss.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {fmt(profitLoss.netProfit)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Expenses Pie Chart */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            Expenses Breakdown
          </h2>
          {loading ? (
            <div className="h-56 bg-gray-100 animate-pulse rounded-lg" />
          ) : !profitLoss || profitLoss.expensesByCategory.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
              No expenses in this period
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={profitLoss.expensesByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="amount"
                    nameKey="category"
                    label={({ category, percent }) =>
                      `${category} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {profitLoss.expensesByCategory.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => fmt(value)}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2 justify-center">
                {profitLoss.expensesByCategory.map((e, idx) => (
                  <div key={e.category} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                    />
                    {e.category}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Outstanding Dues Section ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Customer Dues */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <Users size={18} className="text-red-500" />
              Customer Outstanding Dues
            </h2>
            {!loading && customerDues.length > 0 && (
              <span className="badge-red">{customerDues.length} customers</span>
            )}
          </div>
          {loading ? (
            <SkeletonTable rows={5} />
          ) : customerDues.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              ✅ No outstanding customer dues
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">#</th>
                    <th className="table-header">Shop Name</th>
                    <th className="table-header">Owner</th>
                    <th className="table-header">Due Amount</th>
                    <th className="table-header">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {customerDues.map((c, idx) => {
                    const riskLevel =
                      c.due_amount >= 100000
                        ? { label: 'High', cls: 'badge-red' }
                        : c.due_amount >= 30000
                        ? { label: 'Medium', cls: 'badge-yellow' }
                        : { label: 'Low', cls: 'badge-blue' }
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell text-gray-500 font-medium">{idx + 1}</td>
                        <td className="table-cell font-semibold text-gray-800">{c.shop_name}</td>
                        <td className="table-cell text-gray-600">{c.owner_name}</td>
                        <td className="table-cell font-bold text-red-600">{fmt(c.due_amount)}</td>
                        <td className="table-cell">
                          <span className={riskLevel.cls}>{riskLevel.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Supplier Dues */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <Truck size={18} className="text-orange-500" />
              Supplier Outstanding Dues
            </h2>
            {!loading && supplierDues.length > 0 && (
              <span className="badge-yellow">{supplierDues.length} suppliers</span>
            )}
          </div>
          {loading ? (
            <SkeletonTable rows={5} />
          ) : supplierDues.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              ✅ No outstanding supplier dues
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">#</th>
                    <th className="table-header">Supplier</th>
                    <th className="table-header">Due Amount</th>
                    <th className="table-header">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {supplierDues.map((s, idx) => {
                    const riskLevel =
                      s.due_amount >= 200000
                        ? { label: 'High', cls: 'badge-red' }
                        : s.due_amount >= 50000
                        ? { label: 'Medium', cls: 'badge-yellow' }
                        : { label: 'Low', cls: 'badge-blue' }
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell text-gray-500 font-medium">{idx + 1}</td>
                        <td className="table-cell font-semibold text-gray-800">{s.name}</td>
                        <td className="table-cell font-bold text-orange-600">{fmt(s.due_amount)}</td>
                        <td className="table-cell">
                          <span className={riskLevel.cls}>{riskLevel.label}</span>
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
    </div>
  )
}
