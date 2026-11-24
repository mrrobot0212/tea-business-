import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

interface LayoutProps {
  children: React.ReactNode
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/purchases': 'Purchases',
  '/sales': 'Sales',
  '/payments': 'Payments',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/customers': 'Customers',
  '/suppliers': 'Suppliers',
  '/expenses': 'Expenses',
  '/partners': 'Partners',
  '/reports': 'Reports',
  '/notes': 'Notes',
  '/activity': 'Activity Log',
}

function getPageTitle(pathname: string): string {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  // Prefix match (for nested routes like /purchases/123)
  const match = Object.keys(PAGE_TITLES).find(
    key => key !== '/' && pathname.startsWith(key)
  )
  return match ? PAGE_TITLES[match] : 'TeaLedger'
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pageTitle = getPageTitle(location.pathname)

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Fixed sidebar — 260px on desktop */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — offset by sidebar width on desktop */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-[260px]">
        <TopBar title={pageTitle} onMenuToggle={() => setSidebarOpen(v => !v)} />

        {/* Scrollable page content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
