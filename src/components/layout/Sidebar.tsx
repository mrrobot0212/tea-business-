import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Leaf,
  LayoutDashboard,
  ShoppingCart,
  TrendingUp,
  CreditCard,
  Package,
  Boxes,
  Users,
  Truck,
  Receipt,
  PieChart,
  BarChart3,
  FileText,
  ClipboardList,
  LogOut,
  X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
}

interface NavGroup {
  group: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Dashboard',
    items: [
      { label: 'Dashboard', to: '/', icon: <LayoutDashboard className="h-4 w-4" /> },
    ],
  },
  {
    group: 'Operations',
    items: [
      { label: 'Purchases', to: '/purchases', icon: <ShoppingCart className="h-4 w-4" /> },
      { label: 'Sales', to: '/sales', icon: <TrendingUp className="h-4 w-4" /> },
      { label: 'Payments', to: '/payments', icon: <CreditCard className="h-4 w-4" /> },
    ],
  },
  {
    group: 'Management',
    items: [
      { label: 'Products', to: '/products', icon: <Package className="h-4 w-4" /> },
      { label: 'Inventory', to: '/inventory', icon: <Boxes className="h-4 w-4" /> },
      { label: 'Customers', to: '/customers', icon: <Users className="h-4 w-4" /> },
      { label: 'Suppliers', to: '/suppliers', icon: <Truck className="h-4 w-4" /> },
    ],
  },
  {
    group: 'Finance',
    items: [
      { label: 'Expenses', to: '/expenses', icon: <Receipt className="h-4 w-4" /> },
      { label: 'Partners', to: '/partners', icon: <PieChart className="h-4 w-4" /> },
      { label: 'Reports', to: '/reports', icon: <BarChart3 className="h-4 w-4" /> },
    ],
  },
  {
    group: 'Tools',
    items: [
      { label: 'Notes', to: '/notes', icon: <FileText className="h-4 w-4" /> },
      { label: 'Activity Log', to: '/activity', icon: <ClipboardList className="h-4 w-4" /> },
    ],
  },
]

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation()
  const { partner, signOut } = useAuth()

  function isActive(to: string) {
    if (to === '/') return location.pathname === '/'
    return location.pathname.startsWith(to)
  }

  const partnerInitials = partner?.name
    ? partner.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          'fixed top-0 left-0 z-30 h-full bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out',
          'w-[260px]',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-100">
          <Link to="/" className="flex items-center gap-2.5 group" onClick={onClose}>
            <div className="bg-primary-700 rounded-lg p-1.5">
              <Leaf className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">TeaLedger</span>
          </Link>
          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="lg:hidden text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {NAV_GROUPS.map(group => (
            <div key={group.group}>
              {/* Only show group label for non-Dashboard groups */}
              {group.group !== 'Dashboard' && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {group.group}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map(item => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onClose}
                      className={isActive(item.to) ? 'sidebar-link-active' : 'sidebar-link-inactive'}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Partner footer */}
        <div className="border-t border-gray-100 px-4 py-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="h-9 w-9 rounded-full bg-primary-700 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">{partnerInitials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{partner?.name ?? 'Partner'}</p>
              <p className="text-xs text-gray-400 truncate capitalize">{partner?.role ?? ''}</p>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
