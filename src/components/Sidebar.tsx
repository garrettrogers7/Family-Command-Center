import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, Home, Wallet, FolderKanban, Compass, Settings, Telescope, ChefHat, PartyPopper,
} from 'lucide-react'
import { useFamily } from '@/contexts/FamilyContext'
import { UserAvatar } from '@/components/UserAvatar'

const navItems = [
  { to: '/today',     label: 'Dashboard', icon: LayoutDashboard },
  { to: '/week',      label: 'This Week',  icon: CalendarDays },
  { to: '/year',      label: 'Year Ahead', icon: Telescope },
  { to: '/fun',       label: 'Fun & Upcoming', icon: PartyPopper },
  { to: '/meals',     label: 'Meals',      icon: ChefHat },
  { to: '/household', label: 'Household',  icon: Home },
  { to: '/budget',    label: 'Spending',  icon: Wallet },
  { to: '/projects',  label: 'Projects',  icon: FolderKanban },
  { to: '/vision',    label: 'Vision',    icon: Compass },
]

export function Sidebar() {
  const { family, currentMember, otherMember } = useFamily()

  return (
    <aside
      className="hidden md:flex h-screen w-56 flex-shrink-0 flex-col py-6"
      style={{ backgroundColor: '#0c2340', borderRight: 'none' }}
    >
      {/* Wordmark */}
      <div className="mb-8 px-5">
        <span className="text-sm font-bold tracking-widest uppercase text-white">
          Home Base
        </span>
        {family && (
          <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{family.name}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-all"
            style={({ isActive }) => isActive
              ? { backgroundColor: '#1a6db5', color: 'white' }
              : { color: 'rgba(255,255,255,0.55)' }
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={15} strokeWidth={isActive ? 2.25 : 1.75} />
                <span className={isActive ? 'font-semibold' : ''}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: members + settings */}
      <div className="px-3 pt-4 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
        {currentMember && (
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <UserAvatar member={currentMember} size="sm" />
            {otherMember && <UserAvatar member={otherMember} size="sm" />}
            <span className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {currentMember.display_name.split(' ')[0]}
              {otherMember ? ` & ${otherMember.display_name.split(' ')[0]}` : ''}
            </span>
          </div>
        )}
        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-all"
          style={({ isActive }) => isActive
            ? { backgroundColor: '#1a6db5', color: 'white' }
            : { color: 'rgba(255,255,255,0.55)' }
          }
        >
          {({ isActive }) => (
            <>
              <Settings size={15} strokeWidth={isActive ? 2.25 : 1.75} />
              <span className={isActive ? 'font-semibold' : ''}>Settings</span>
            </>
          )}
        </NavLink>
      </div>
    </aside>
  )
}
