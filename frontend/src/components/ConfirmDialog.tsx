'use client'

import React from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

const variantConfig = {
  danger: {
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    confirmBg: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  warning: {
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    confirmBg: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  info: {
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    confirmBg: 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'warning',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  const config = variantConfig[variant]

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={`flex-shrink-0 w-12 h-12 rounded-full ${config.iconBg} flex items-center justify-center ${config.iconColor}`}>
              {config.icon}
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
              <h3 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900">
                {title}
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2.5 text-sm font-medium text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${config.confirmBg}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
