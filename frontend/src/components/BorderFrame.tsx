'use client'

import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'

interface BorderFrameProps {
  children?: ReactNode
}

export function BorderFrame({ children }: BorderFrameProps) {
  const pathname = usePathname()
  
  // Don't show border on login/signup/auth pages
  const isAuthPage = pathname?.startsWith('/auth') || pathname === '/'
  
  if (isAuthPage) {
    return <>{children}</>
  }
  
  return (
    <>
      {/* Border frame - left and right only */}
      <div className="fixed inset-0 pointer-events-none z-[100]">
        <div className="absolute top-0 left-0 bottom-0 w-6 bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400"></div>
        <div className="absolute top-0 right-0 bottom-0 w-6 bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400"></div>
      </div>
      {/* Content with padding for border */}
      <div className="min-h-screen pl-6 pr-6">
        {children}
      </div>
    </>
  )
}
