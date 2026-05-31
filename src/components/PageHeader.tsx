import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 px-6 py-4 md:px-8"
      style={{
        background: 'linear-gradient(135deg, #0c2340 0%, #0f3460 55%, #1a6db5 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div>
        {subtitle && (
          <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(122,175,212,0.85)' }}>
            {subtitle}
          </p>
        )}
        <h1 className="text-lg font-bold tracking-tight text-white">{title}</h1>
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      )}
    </div>
  )
}
