import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { BottomNav } from '@/components/BottomNav'

export function Layout() {
  return (
    <div className="relative flex h-screen overflow-hidden" style={{ backgroundColor: '#060412' }}>

      {/* ── Stripe-style gradient mesh background ── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {/* Indigo blob — top right */}
        <div style={{
          position: 'absolute',
          top: '-15%',
          right: '-8%',
          width: '680px',
          height: '680px',
          background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.06) 40%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(1px)',
        }} />
        {/* Violet blob — bottom left */}
        <div style={{
          position: 'absolute',
          bottom: '-20%',
          left: '-5%',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(139,92,246,0.14) 0%, rgba(139,92,246,0.04) 45%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(1px)',
        }} />
        {/* Blue blob — mid left */}
        <div style={{
          position: 'absolute',
          top: '35%',
          left: '15%',
          width: '420px',
          height: '420px',
          background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 65%)',
          borderRadius: '50%',
        }} />
      </div>

      {/* Sidebar — desktop only */}
      <div className="relative z-10">
        <Sidebar />
      </div>

      {/* Main content */}
      <main className="relative z-10 flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav — mobile only */}
      <BottomNav />
    </div>
  )
}
