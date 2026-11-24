import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Leaf, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      {/* Brand */}
      <div className="flex items-center gap-2 mb-10">
        <div className="bg-primary-700 p-2 rounded-lg">
          <Leaf className="h-7 w-7 text-white" />
        </div>
        <span className="text-2xl font-bold text-primary-700">TeaLedger</span>
      </div>

      {/* 404 Illustration */}
      <div className="text-center">
        <p className="text-[8rem] font-extrabold text-primary-100 leading-none select-none">
          404
        </p>
        <h1 className="text-3xl font-bold text-gray-800 -mt-4 mb-3">Page Not Found</h1>
        <p className="text-gray-500 max-w-sm mx-auto mb-8">
          The page you're looking for doesn't exist or has been moved. Let's get you back on track.
        </p>

        <button
          onClick={() => navigate('/')}
          className="btn-primary inline-flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}
