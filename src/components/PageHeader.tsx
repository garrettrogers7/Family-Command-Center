import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8 md:py-5"
      style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}
    >
      <div>
        <h1 className="text-xl font-bold tracking-tight" style={{ color: '#0f172a' }}>{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-xs" style={{ color: '#94a3b8' }}>{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      )}
    </div>
  )
}
