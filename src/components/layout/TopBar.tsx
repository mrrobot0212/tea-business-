import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, Bell, ChevronDown, User, KeyRound, LogOut } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'

interface TopBarProps {
  title: string
  onMenuToggle: () => void
}

export default function TopBar({ title, onMenuToggle }: TopBarProps) {
  const { partner, signOut } = useAuth()
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const partnerInitials = partner?.name
    ? partner.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  async function handleSignOut() {
    setDropdownOpen(false)
    await signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-10 h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-4 shadow-sm">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden text-gray-500 hover:text-primary-700 transition-colors p-1 rounded-md"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-gray-800 truncate">{title}</h1>
        {/* Date/time — hidden on small screens, shown on sm+ */}
        <p className="hidden sm:block text-xs text-gray-400 mt-0.5 tabular-nums">
          {format(now, 'EEEE, dd MMMM yyyy')}
          <span className="ml-2 font-mono">{format(now, 'hh:mm:ss aa')}</span>
        </p>
      </div>

      {/* Date/time — compact on mobile */}
      <div className="sm:hidden flex flex-col items-end leading-tight">
        <span className="text-[10px] text-gray-400 tabular-nums">{format(now, 'dd MMM yyyy')}</span>
        <span className="text-[10px] text-gray-400 font-mono tabular-nums">{format(now, 'hh:mm:ss aa')}</span>
      </div>

      {/* Notification bell */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setNotifOpen(v => !v)}
          className="relative text-gray-500 hover:text-primary-700 transition-colors p-2 rounded-full hover:bg-gray-100"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {/* Badge */}
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>

        {notifOpen && (
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-20">
            <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notifications</p>
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No new notifications
            </div>
          </div>
        )}
      </div>

      {/* Partner avatar / dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(v => !v)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 transition-colors"
          aria-label="User menu"
        >
          <div className="h-8 w-8 rounded-full bg-primary-700 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">{partnerInitials}</span>
          </div>
          <span className="hidden md:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
            {partner?.name ?? 'Partner'}
          </span>
          <ChevronDown
            className={`hidden md:block h-4 w-4 text-gray-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20">
            {/* Partner info */}
            <div className="px-4 py-2.5 border-b border-gray-100 mb-1">
              <p className="text-sm font-semibold text-gray-800 truncate">{partner?.name ?? 'Partner'}</p>
              <p className="text-xs text-gray-400 capitalize">{partner?.role ?? ''}</p>
            </div>

            <button
              onClick={() => { setDropdownOpen(false); navigate('/partners') }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <User className="h-4 w-4 text-gray-400" />
              Profile
            </button>

            <button
              onClick={() => { setDropdownOpen(false); navigate('/partners') }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <KeyRound className="h-4 w-4 text-gray-400" />
              Change Password
            </button>

            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
