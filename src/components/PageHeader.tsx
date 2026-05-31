import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-white/8 px-4 py-4 backdrop-blur-sm md:px-8 md:py-5"
      style={{ backgroundColor: 'rgba(13, 13, 20, 0.95)' }}
    >
      <div className="flex items-center gap-3">
        <div className="h-7 w-1 rounded-full bg-blue-500" />
        <div>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-xs text-white/40">{subtitle}</p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      )}
    </div>
  )
}
