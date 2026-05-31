import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 px-6 py-3 md:px-8"
      style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #dde8f5' }}
    >
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 rounded-full" style={{ backgroundColor: '#1a6db5' }} />
        <div>
          <h1 className="text-base font-bold tracking-tight" style={{ color: '#0c2340' }}>{title}</h1>
          {subtitle && (
            <p className="text-[11px]" style={{ color: '#7aafd4' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      )}
    </div>
  )
}
