// Flat, blue-palette illustrations for the Dashboard section cards.
// Hand-authored SVG so no external image assets are needed.

import { Telescope, ChefHat, Settings as SettingsIcon } from 'lucide-react'

function Base({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" className="h-16 w-16">
      <circle cx="50" cy="50" r="50" fill={bg} />
      {children}
    </svg>
  )
}

function IconBase({ bg, icon: Icon }: { bg: string; icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> }) {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: bg }}>
      <Icon size={32} color="#1a6db5" strokeWidth={1.75} />
    </div>
  )
}

export function WeekIllustration() {
  return (
    <Base bg="#e3eefb">
      <rect x="28" y="26" width="44" height="40" rx="4" fill="#ffffff" stroke="#1a6db5" strokeWidth="2" />
      <rect x="28" y="26" width="44" height="10" rx="4" fill="#1a6db5" />
      <rect x="35" y="42" width="20" height="3.5" rx="1.5" fill="#7aafd4" />
      <rect x="35" y="50" width="14" height="3.5" rx="1.5" fill="#dde8f5" />
      <path d="M58 49l3.5 3.5L68 45" fill="none" stroke="#1a6db5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  )
}

export function YearAheadIllustration() {
  return <IconBase bg="#e3eefb" icon={Telescope} />
}

export function MealsIllustration() {
  return <IconBase bg="#e3eefb" icon={ChefHat} />
}

export function HouseholdIllustration() {
  return (
    <Base bg="#e3eefb">
      <path d="M30 52L50 34l20 18" fill="none" stroke="#1a6db5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="34" y="52" width="32" height="20" rx="2" fill="#ffffff" stroke="#1a6db5" strokeWidth="2" />
      <rect x="46" y="58" width="8" height="14" rx="1" fill="#7aafd4" />
    </Base>
  )
}

export function SpendingIllustration() {
  return (
    <Base bg="#e3eefb">
      <rect x="28" y="38" width="44" height="30" rx="6" fill="#ffffff" stroke="#1a6db5" strokeWidth="2" />
      <path d="M28 44c8-6 36-6 44 0" fill="none" stroke="#1a6db5" strokeWidth="2" />
      <circle cx="60" cy="54" r="6" fill="#1a6db5" />
      <text x="60" y="57" textAnchor="middle" fontSize="8" fill="#ffffff" fontWeight="bold">$</text>
    </Base>
  )
}

export function ProjectsIllustration() {
  return (
    <Base bg="#e3eefb">
      <rect x="32" y="28" width="36" height="44" rx="3" fill="#ffffff" stroke="#1a6db5" strokeWidth="2" />
      <rect x="42" y="24" width="16" height="8" rx="2" fill="#1a6db5" />
      <rect x="38" y="42" width="24" height="3.5" rx="1.5" fill="#dde8f5" />
      <rect x="38" y="50" width="24" height="3.5" rx="1.5" fill="#dde8f5" />
      <path d="M38 60l4 4 8-8" fill="none" stroke="#1a6db5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  )
}

export function VisionIllustration() {
  return (
    <Base bg="#e3eefb">
      <path d="M28 64l16-26 10 14 8-10 10 22z" fill="#1a6db5" />
      <circle cx="64" cy="30" r="6" fill="#f6a623" />
    </Base>
  )
}

export function SettingsIllustration() {
  return <IconBase bg="#e3eefb" icon={SettingsIcon} />
}
