import { useEffect, useState, useCallback } from 'react'
import {
  Package,
  TrendingUp,
  DollarSign,
  BarChart3,
  AlertCircle,
  Truck,
  Receipt,
  RefreshCw,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subDays,
  subMonths,
  startOfDay as sod,
  parseISO,
} from 'date-fns'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../lib/database.types'

// ─── Types ───────────────────────────────────────────────────────────────────

type Sale = Database['public']['Tables']['sales']['Row']
type Product = Database['public']['Tables']['products']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type Supplier = Database['public']['Tables']['suppliers']['Row']
type Purchase = Database['public']['Tables']['purchases']['Row']
type Expense = Database['public']['Tables']['expenses']['Row']
type SaleItem = Database['public']['Tables']['sale_items']['Row']

interface DashboardStats {
  totalStockKg: number
  todaySalesCount: number
  todayRevenue: number
  monthlyRevenue: number
  totalCustomerDues: number
  totalSupplierDues: number
  totalExpenses: number
  netProfit: number
}

interface RecentSale {
  id: string
  invoice_number: string
  customer_name: string
  sale_date: string
  final_amount: number
  paid_amount: number
  delivery_status: 'pending' | 'delivered' | 'cancelled'
  payment_method: string
}

interface LowStockProduct {
  id: string
  name: string
  sku: string
  current_stock_kg: number
  minimum_stock_kg: number
}

interface TopCustomerDue {
  id: string
  shop_name: string
  owner_name: string
  due_amount: number
}

interface WeeklySalesPoint {
  day: string
  revenue: number
  sales: number
}

interface MonthlyRevenuePoint {
  month: string
  revenue: number
}

interface PurchaseVsSalesPoint {
  month: string
  purchases: number
  sales: number
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

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { partner } = useAuth()

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([])
  const [topCustomerDues, setTopCustomerDues] = useState<TopCustomerDue[]>([])
  const [weeklySales, setWeeklySales] = useState<WeeklySalesPoint[]>([])
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenuePoint[]>([])
  const [purchaseVsSales, setPurchaseVsSales] = useState<PurchaseVsSalesPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    try {
      const now = new Date()
      const todayStart = startOfDay(now).toISOString()
      const todayEnd = endOfDay(now).toISOString()
      const monthStart = startOfMonth(now).toISOString()
      const monthEnd = endOfMonth(now).toISOString()

      // ── Parallel fetches ──────────────────────────────────────────────────

      const [
        productsRes,
        todaySalesRes,
        monthlySalesRes,
        allSalesRes,
        customersRes,
        suppliersRes,
        expensesRes,
        recentSalesRes,
        saleItemsRes,
        allPurchasesRes,
      ] = await Promise.all([
        supabase.from('products').select('id, name, sku, current_stock_kg, minimum_stock_kg, is_active'),
        supabase
          .from('sales')
          .select('id, final_amount, paid_amount')
          .gte('sale_date', todayStart)
          .lte('sale_date', todayEnd),
        supabase
          .from('sales')
          .select('id, final_amount')
          .gte('sale_date', monthStart)
          .lte('sale_date', monthEnd),
        supabase
          .from('sales')
          .select('id, sale_date, final_amount')
          .gte('sale_date', subDays(now, 180).toISOString()),
        supabase
          .from('customers')
          .select('id, shop_name, owner_name, total_purchased_amount, total_paid_amount'),
        supabase
          .from('suppliers')
          .select('id, total_purchased, total_paid'),
        supabase
          .from('expenses')
          .select('id, amount'),
        supabase
          .from('sales')
          .select(`
            id,
            invoice_number,
            sale_date,
            final_amount,
            paid_amount,
            delivery_status,
            payment_method,
            customers ( shop_name, owner_name )
          `)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('sale_items')
          .select('id, sale_id, quantity_kg, cost_per_kg, total_amount'),
        supabase
          .from('purchases')
          .select('id, purchase_date, total_landed_cost')
          .gte('purchase_date', subDays(now, 180).toISOString()),
      ])

      // ── Stats Computation ─────────────────────────────────────────────────

      const products = productsRes.data ?? []
      const totalStockKg = products
        .filter(p => p.is_active)
        .reduce((sum, p) => sum + (p.current_stock_kg ?? 0), 0)

      const todaySales = todaySalesRes.data ?? []
      const todaySalesCount = todaySales.length
      const todayRevenue = todaySales.reduce((s, r) => s + (r.final_amount ?? 0), 0)

      const monthlySales = monthlySalesRes.data ?? []
      const monthlyRevenue = monthlySales.reduce((s, r) => s + (r.final_amount ?? 0), 0)

      const customers = customersRes.data ?? []
      const totalCustomerDues = customers.reduce(
        (s, c) => s + Math.max(0, (c.total_purchased_amount ?? 0) - (c.total_paid_amount ?? 0)),
        0
      )

      const suppliers = suppliersRes.data ?? []
      const totalSupplierDues = suppliers.reduce(
        (s, sup) => s + Math.max(0, (sup.total_purchased ?? 0) - (sup.total_paid ?? 0)),
        0
      )

      const expenses = expensesRes.data ?? []
      const totalExpenses = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)

      // Net Profit = Revenue - COGS - Expenses
      const saleItems = saleItemsRes.data ?? []
      const totalCOGS = saleItems.reduce(
        (s, si) => s + (si.quantity_kg ?? 0) * (si.cost_per_kg ?? 0),
        0
      )
      const allSalesForProfit = allSalesRes.data ?? []
      const totalRevenue = allSalesForProfit.reduce((s, r) => s + (r.final_amount ?? 0), 0)
      const netProfit = totalRevenue - totalCOGS - totalExpenses

      setStats({
        totalStockKg,
        todaySalesCount,
        todayRevenue,
        monthlyRevenue,
        totalCustomerDues,
        totalSupplierDues,
        totalExpenses,
        netProfit,
      })

      // ── Recent Sales ──────────────────────────────────────────────────────

      const rawRecent = (recentSalesRes.data ?? []) as any[]
      setRecentSales(
        rawRecent.map(s => ({
          id: s.id,
          invoice_number: s.invoice_number,
          customer_name: s.customers
            ? `${s.customers.shop_name}`
            : 'Unknown',
          sale_date: s.sale_date,
          final_amount: s.final_amount ?? 0,
          paid_amount: s.paid_amount ?? 0,
          delivery_status: s.delivery_status,
          payment_method: s.payment_method,
        }))
      )

      // ── Low Stock ─────────────────────────────────────────────────────────

      const low = products.filter(
        p => p.is_active && p.current_stock_kg <= p.minimum_stock_kg
      )
      setLowStockProducts(low)

      // ── Top Customer Dues ─────────────────────────────────────────────────

      const dueCustomers = customers
        .map(c => ({
          id: c.id,
          shop_name: c.shop_name,
          owner_name: c.owner_name,
          due_amount: Math.max(0, (c.total_purchased_amount ?? 0) - (c.total_paid_amount ?? 0)),
        }))
        .filter(c => c.due_amount > 0)
        .sort((a, b) => b.due_amount - a.due_amount)
        .slice(0, 10)
      setTopCustomerDues(dueCustomers)

      // ── Weekly Sales Chart ─────────────────────────────────────────────────

      const last7: WeeklySalesPoint[] = Array.from({ length: 7 }, (_, i) => {
        const d = subDays(now, 6 - i)
        return { day: format(d, 'EEE dd'), revenue: 0, sales: 0 }
      })
      const allSales = allSalesRes.data ?? []
      allSales.forEach(s => {
        const sDate = parseISO(s.sale_date)
        const daysAgo = Math.floor(
          (sod(now).getTime() - sod(sDate).getTime()) / (1000 * 60 * 60 * 24)
        )
        if (daysAgo >= 0 && daysAgo < 7) {
          const idx = 6 - daysAgo
          last7[idx].revenue += s.final_amount ?? 0
          last7[idx].sales += 1
        }
      })
      setWeeklySales(last7)

      // ── Monthly Revenue Chart (last 6 months) ─────────────────────────────

      const last6Months: MonthlyRevenuePoint[] = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(now, 5 - i)
        return { month: format(d, 'MMM yy'), revenue: 0 }
      })
      allSales.forEach(s => {
        const sDate = parseISO(s.sale_date)
        for (let i = 0; i < 6; i++) {
          const refMonth = subMonths(now, 5 - i)
          if (
            sDate.getFullYear() === refMonth.getFullYear() &&
            sDate.getMonth() === refMonth.getMonth()
          ) {
            last6Months[i].revenue += s.final_amount ?? 0
          }
        }
      })
      setMonthlyRevenue(last6Months)

      // ── Purchase vs Sales Chart (last 6 months) ───────────────────────────

      const allPurchases = allPurchasesRes.data ?? []
      const pvs: PurchaseVsSalesPoint[] = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(now, 5 - i)
        return { month: format(d, 'MMM yy'), purchases: 0, sales: 0 }
      })
      allSales.forEach(s => {
        const sDate = parseISO(s.sale_date)
        for (let i = 0; i < 6; i++) {
          const refMonth = subMonths(now, 5 - i)
          if (
            sDate.getFullYear() === refMonth.getFullYear() &&
            sDate.getMonth() === refMonth.getMonth()
          ) {
            pvs[i].sales += s.final_amount ?? 0
          }
        }
      })
      allPurchases.forEach(p => {
        const pDate = parseISO(p.purchase_date)
        for (let i = 0; i < 6; i++) {
          const refMonth = subMonths(now, 5 - i)
          if (
            pDate.getFullYear() === refMonth.getFullYear() &&
            pDate.getMonth() === refMonth.getMonth()
          ) {
            pvs[i].purchases += p.total_landed_cost ?? 0
          }
        }
      })
      setPurchaseVsSales(pvs)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  // ── Delivery status badge ──────────────────────────────────────────────────

  function DeliveryBadge({ status }: { status: 'pending' | 'delivered' | 'cancelled' }) {
    const map = {
      delivered: 'badge-green',
      pending: 'badge-yellow',
      cancelled: 'badge-red',
    } as const
    return (
      <span className={map[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  // ── Payment badge ─────────────────────────────────────────────────────────

  function PaymentBadge({ sale }: { sale: RecentSale }) {
    const due = sale.final_amount - sale.paid_amount
    if (due <= 0) return <span className="badge-green">Paid</span>
    if (sale.paid_amount > 0) return <span className="badge-yellow">Partial</span>
    return <span className="badge-red">Unpaid</span>
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Welcome back, {partner?.name ?? 'Partner'} · {format(new Date(), 'EEEE, dd MMMM yyyy')}
          </p>
        </div>
        <button
          onClick={() => fetchDashboardData(true)}
          disabled={refreshing}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Total Stock"
              value={`${(stats?.totalStockKg ?? 0).toLocaleString('en-IN')} KG`}
              subtitle="Active products"
              icon={<Package size={20} />}
              bgColor="bg-green-50"
              textColor="text-green-700"
              iconBg="bg-green-100"
              iconColor="text-green-600"
            />
            <StatCard
              title="Today's Sales"
              value={`${stats?.todaySalesCount ?? 0} orders`}
              subtitle={format(new Date(), 'dd MMM yyyy')}
              icon={<TrendingUp size={20} />}
              bgColor="bg-blue-50"
              textColor="text-blue-700"
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
            />
            <StatCard
              title="Today's Revenue"
              value={fmt(stats?.todayRevenue ?? 0)}
              subtitle="From today's sales"
              icon={<DollarSign size={20} />}
              bgColor="bg-emerald-50"
              textColor="text-emerald-700"
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
            />
            <StatCard
              title="Monthly Revenue"
              value={fmt(stats?.monthlyRevenue ?? 0)}
              subtitle={format(new Date(), 'MMMM yyyy')}
              icon={<BarChart3 size={20} />}
              bgColor="bg-purple-50"
              textColor="text-purple-700"
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
            />
            <StatCard
              title="Customer Dues"
              value={fmt(stats?.totalCustomerDues ?? 0)}
              subtitle="Total receivable"
              icon={<AlertCircle size={20} />}
              bgColor="bg-red-50"
              textColor="text-red-700"
              iconBg="bg-red-100"
              iconColor="text-red-600"
            />
            <StatCard
              title="Supplier Dues"
              value={fmt(stats?.totalSupplierDues ?? 0)}
              subtitle="Total payable"
              icon={<Truck size={20} />}
              bgColor="bg-orange-50"
              textColor="text-orange-700"
              iconBg="bg-orange-100"
              iconColor="text-orange-600"
            />
            <StatCard
              title="Total Expenses"
              value={fmt(stats?.totalExpenses ?? 0)}
              subtitle="All time"
              icon={<Receipt size={20} />}
              bgColor="bg-gray-50"
              textColor="text-gray-700"
              iconBg="bg-gray-200"
              iconColor="text-gray-600"
            />
            <StatCard
              title="Net Profit"
              value={fmt(stats?.netProfit ?? 0)}
              subtitle="Revenue − COGS − Expenses"
              icon={<TrendingUp size={20} />}
              bgColor={(stats?.netProfit ?? 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}
              textColor={(stats?.netProfit ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}
              iconBg={(stats?.netProfit ?? 0) >= 0 ? 'bg-green-100' : 'bg-red-100'}
              iconColor={(stats?.netProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}
            />
          </>
        )}
      </div>

      {/* ── Charts Row 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Sales Bar Chart */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            Weekly Sales — Last 7 Days
          </h2>
          {loading ? (
            <div className="h-56 bg-gray-100 animate-pulse rounded-lg" />
          ) : weeklySales.every(d => d.revenue === 0) ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
              No sales data for the last 7 days
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklySales} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
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

        {/* Monthly Revenue Line Chart */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            Monthly Revenue — Last 6 Months
          </h2>
          {loading ? (
            <div className="h-56 bg-gray-100 animate-pulse rounded-lg" />
          ) : monthlyRevenue.every(d => d.revenue === 0) ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
              No revenue data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => `৳${(v / 1000).toFixed(0)}k`}
                  width={52}
                />
                <Tooltip content={<CurrencyTooltip />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#15803d"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#15803d' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Purchase vs Sales Chart ── */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4">
          Purchases vs Sales — Last 6 Months
        </h2>
        {loading ? (
          <div className="h-56 bg-gray-100 animate-pulse rounded-lg" />
        ) : purchaseVsSales.every(d => d.purchases === 0 && d.sales === 0) ? (
          <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
            No comparison data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={purchaseVsSales} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={v => `৳${(v / 1000).toFixed(0)}k`}
                width={52}
              />
              <Tooltip content={<CurrencyTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="purchases" name="Purchases" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sales" name="Sales" fill="#15803d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Tables Row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Sales */}
        <div className="card overflow-hidden">
          <h2 className="text-base font-semibold text-gray-800 mb-4 px-1">
            Recent Sales
          </h2>
          {loading ? (
            <SkeletonTable rows={6} />
          ) : recentSales.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No sales recorded yet</div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">Invoice</th>
                    <th className="table-header">Customer</th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Amount</th>
                    <th className="table-header">Payment</th>
                    <th className="table-header">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentSales.map(sale => (
                    <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium text-green-700">
                        {sale.invoice_number}
                      </td>
                      <td className="table-cell">{sale.customer_name}</td>
                      <td className="table-cell text-gray-500">
                        {format(parseISO(sale.sale_date), 'dd MMM yy')}
                      </td>
                      <td className="table-cell font-semibold">
                        {fmt(sale.final_amount)}
                      </td>
                      <td className="table-cell">
                        <PaymentBadge sale={sale} />
                      </td>
                      <td className="table-cell">
                        <DeliveryBadge status={sale.delivery_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Low Stock Alerts */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-base font-semibold text-gray-800">
              Low Stock Alerts
            </h2>
            {!loading && lowStockProducts.length > 0 && (
              <span className="badge-red">{lowStockProducts.length} items</span>
            )}
          </div>
          {loading ? (
            <SkeletonTable rows={5} />
          ) : lowStockProducts.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              ✅ All products are adequately stocked
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">Product</th>
                    <th className="table-header">SKU</th>
                    <th className="table-header">Current</th>
                    <th className="table-header">Minimum</th>
                    <th className="table-header">Deficit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lowStockProducts.map(p => {
                    const deficit = p.minimum_stock_kg - p.current_stock_kg
                    return (
                      <tr key={p.id} className="hover:bg-red-50 transition-colors">
                        <td className="table-cell font-medium text-gray-800">{p.name}</td>
                        <td className="table-cell text-gray-500">{p.sku}</td>
                        <td className="table-cell">
                          <span className="text-red-600 font-semibold">
                            {p.current_stock_kg.toLocaleString('en-IN')} KG
                          </span>
                        </td>
                        <td className="table-cell text-gray-600">
                          {p.minimum_stock_kg.toLocaleString('en-IN')} KG
                        </td>
                        <td className="table-cell">
                          <span className="badge-red">
                            -{deficit.toLocaleString('en-IN')} KG
                          </span>
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

      {/* ── Top Customer Dues ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-base font-semibold text-gray-800">
            Top Customers by Outstanding Due
          </h2>
          {!loading && topCustomerDues.length > 0 && (
            <span className="badge-red">{topCustomerDues.length} customers</span>
          )}
        </div>
        {loading ? (
          <SkeletonTable rows={5} />
        ) : topCustomerDues.length === 0 ? (
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
                {topCustomerDues.map((c, idx) => {
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
                      <td className="table-cell font-bold text-red-600">
                        {fmt(c.due_amount)}
                      </td>
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
  )
}
