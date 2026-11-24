import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Leaf } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/layout/Layout'

// ── Lazy page imports ───────────────────────────────────────────────────────
const Login      = lazy(() => import('./pages/Login'))
const Dashboard  = lazy(() => import('./pages/Dashboard'))
const Products   = lazy(() => import('./pages/Products'))
const Inventory  = lazy(() => import('./pages/Inventory'))
const Purchases  = lazy(() => import('./pages/Purchases'))
const Sales      = lazy(() => import('./pages/Sales'))
const Payments   = lazy(() => import('./pages/Payments'))
const Customers  = lazy(() => import('./pages/Customers'))
const Suppliers  = lazy(() => import('./pages/Suppliers'))
const Expenses   = lazy(() => import('./pages/Expenses'))
const Partners   = lazy(() => import('./pages/Partners'))
const Reports    = lazy(() => import('./pages/Reports'))
const Notes      = lazy(() => import('./pages/Notes'))
const Activity   = lazy(() => import('./pages/ActivityLog'))

// ── Loading spinner ──────────────────────────────────────────────────────────
function FullPageSpinner() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
      <div className="bg-primary-700 rounded-full p-4 animate-pulse">
        <Leaf className="h-8 w-8 text-white" />
      </div>
      <div className="flex items-center gap-2 text-primary-700">
        <svg
          className="animate-spin h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="text-sm font-medium">Loading TeaLedger…</span>
      </div>
    </div>
  )
}

// ── Protected route guard ────────────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

// ── App routes ───────────────────────────────────────────────────────────────
function AppRoutes() {
  const { loading } = useAuth()

  if (loading) return <FullPageSpinner />

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected — wrapped in Layout */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout><Dashboard /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/products"
          element={
            <RequireAuth>
              <Layout><Products /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/inventory"
          element={
            <RequireAuth>
              <Layout><Inventory /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/purchases"
          element={
            <RequireAuth>
              <Layout><Purchases /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/sales"
          element={
            <RequireAuth>
              <Layout><Sales /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/payments"
          element={
            <RequireAuth>
              <Layout><Payments /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/customers"
          element={
            <RequireAuth>
              <Layout><Customers /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/suppliers"
          element={
            <RequireAuth>
              <Layout><Suppliers /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/expenses"
          element={
            <RequireAuth>
              <Layout><Expenses /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/partners"
          element={
            <RequireAuth>
              <Layout><Partners /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireAuth>
              <Layout><Reports /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/notes"
          element={
            <RequireAuth>
              <Layout><Notes /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/activity"
          element={
            <RequireAuth>
              <Layout><Activity /></Layout>
            </RequireAuth>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

// ── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '10px',
              background: '#1f2937',
              color: '#f9fafb',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#15803d', secondary: '#f9fafb' },
            },
            error: {
              iconTheme: { primary: '#dc2626', secondary: '#f9fafb' },
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}
