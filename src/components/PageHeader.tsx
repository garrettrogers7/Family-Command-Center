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
      style={{
        backgroundColor: 'rgba(6, 4, 18, 0.80)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="h-6 w-1 rounded-full"
          style={{ background: 'linear-gradient(180deg, #6366f1 0%, #8b5cf6 100%)' }}
        />
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      )}
    </div>
  )
}
