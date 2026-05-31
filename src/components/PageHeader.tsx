import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-white/95 px-4 py-4 backdrop-blur-sm md:px-8 md:py-5">
      <div className="flex items-center gap-3">
        <div className="h-7 w-1 rounded-full bg-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-gray-400">{subtitle}</p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      )}
    </div>
  )
}
