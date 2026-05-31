import { NavLink } from 'react-router-dom'
import { LayoutDashboard, CalendarDays, Home, Wallet, FolderKanban } from 'lucide-react'

const navItems = [
  { to: '/today',     label: 'Home',      icon: LayoutDashboard },
  { to: '/week',      label: 'Week',      icon: CalendarDays },
  { to: '/household', label: 'Household', icon: Home },
  { to: '/budget',    label: 'Spending',  icon: Wallet },
  { to: '/projects',  label: 'Projects',  icon: FolderKanban },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/8 backdrop-blur-sm md:hidden"
      style={{ backgroundColor: 'rgba(13, 13, 20, 0.96)' }}
    >
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[10px] font-medium transition-colors ${
              isActive ? 'text-blue-400' : 'text-white/30'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b-full bg-blue-500" />
              )}
              <Icon size={21} strokeWidth={isActive ? 2.25 : 1.6} />
              <span className={isActive ? 'font-semibold' : ''}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
