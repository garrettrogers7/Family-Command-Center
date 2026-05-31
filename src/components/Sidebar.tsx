import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, Home, Wallet, FolderKanban, Compass, Settings,
} from 'lucide-react'
import { useFamily } from '@/contexts/FamilyContext'
import { UserAvatar } from '@/components/UserAvatar'

const navItems = [
  { to: '/today',     label: 'Dashboard', icon: LayoutDashboard },
  { to: '/week',      label: 'This Week', icon: CalendarDays },
  { to: '/household', label: 'Household', icon: Home },
  { to: '/budget',    label: 'Spending',  icon: Wallet },
  { to: '/projects',  label: 'Projects',  icon: FolderKanban },
  { to: '/vision',    label: 'Vision',    icon: Compass },
]

export function Sidebar() {
  const { family, currentMember, otherMember } = useFamily()

  return (
    <aside
      className="hidden md:flex h-screen w-56 flex-shrink-0 flex-col px-4 py-6"
      style={{ backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0' }}
    >
      {/* Wordmark */}
      <div className="mb-8 px-2">
        <span className="text-sm font-bold tracking-widest uppercase" style={{ color: '#1e3a5f' }}>
          Home Base
        </span>
        {family && (
          <p className="mt-0.5 text-xs" style={{ color: '#94a3b8' }}>{family.name}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="flex items-center gap-2.5 px-2 py-2 text-sm font-medium transition-all"
            style={({ isActive }) => isActive
              ? { color: '#1e3a5f', borderLeft: '2px solid #3b82f6', paddingLeft: '6px', backgroundColor: '#f0f7ff' }
              : { color: '#64748b', borderLeft: '2px solid transparent', paddingLeft: '6px' }
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={15} strokeWidth={isActive ? 2.25 : 1.75} color={isActive ? '#1e3a5f' : '#94a3b8'} />
                <span className={isActive ? 'font-semibold' : ''}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: members + settings */}
      <div className="space-y-0.5 pt-4" style={{ borderTop: '1px solid #e2e8f0' }}>
        {currentMember && (
          <div className="flex items-center gap-2 px-2 py-2 mb-1">
            <UserAvatar member={currentMember} size="sm" />
            {otherMember && <UserAvatar member={otherMember} size="sm" />}
            <span className="text-xs truncate" style={{ color: '#94a3b8' }}>
              {currentMember.display_name.split(' ')[0]}
              {otherMember ? ` & ${otherMember.display_name.split(' ')[0]}` : ''}
            </span>
          </div>
        )}
        <NavLink
          to="/settings"
          className="flex items-center gap-2.5 px-2 py-2 text-sm font-medium transition-all"
          style={({ isActive }) => isActive
            ? { color: '#1e3a5f', borderLeft: '2px solid #3b82f6', paddingLeft: '6px', backgroundColor: '#f0f7ff' }
            : { color: '#64748b', borderLeft: '2px solid transparent', paddingLeft: '6px' }
          }
        >
          {({ isActive }) => (
            <>
              <Settings size={15} strokeWidth={isActive ? 2.25 : 1.75} color={isActive ? '#1e3a5f' : '#94a3b8'} />
              <span className={isActive ? 'font-semibold' : ''}>Settings</span>
            </>
          )}
        </NavLink>
      </div>
    </aside>
  )
}
