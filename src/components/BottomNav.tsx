import { NavLink } from 'react-router-dom'
import { LayoutDashboard, CalendarDays, Home, Wallet, FolderKanban, Telescope } from 'lucide-react'

const navItems = [
  { to: '/today',     label: 'Home',      icon: LayoutDashboard },
  { to: '/week',      label: 'Week',      icon: CalendarDays },
  { to: '/year',      label: 'Year',      icon: Telescope },
  { to: '/household', label: 'Household', icon: Home },
  { to: '/projects',  label: 'Projects',  icon: FolderKanban },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden"
      style={{ backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0' }}
    >
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[10px] font-medium transition-colors"
          style={({ isActive }) => ({ color: isActive ? '#1a6db5' : '#94a3b8' })}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8" style={{ backgroundColor: '#1a6db5' }} />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.25 : 1.6} />
              <span className={isActive ? 'font-bold' : ''}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
