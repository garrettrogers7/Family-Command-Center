// Flat, blue-palette illustrations for the Dashboard section cards.
// Hand-authored SVG so no external image assets are needed.

function Base({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" className="h-16 w-16">
      <circle cx="50" cy="50" r="50" fill={bg} />
      {children}
    </svg>
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
  return (
    <Base bg="#e3eefb">
      <line x1="42" y1="62" x2="58" y2="62" stroke="#1a6db5" strokeWidth="3" strokeLinecap="round" />
      <line x1="50" y1="62" x2="50" y2="50" stroke="#1a6db5" strokeWidth="3" strokeLinecap="round" />
      <rect x="30" y="32" width="34" height="18" rx="9" fill="#1a6db5" transform="rotate(-18 47 41)" />
      <circle cx="68" cy="26" r="2" fill="#7aafd4" />
      <circle cx="74" cy="36" r="1.6" fill="#7aafd4" />
      <circle cx="63" cy="18" r="1.4" fill="#7aafd4" />
    </Base>
  )
}

export function MealsIllustration() {
  return (
    <Base bg="#e3eefb">
      <circle cx="50" cy="54" r="20" fill="#ffffff" stroke="#1a6db5" strokeWidth="2" />
      <ellipse cx="50" cy="54" rx="13" ry="6" fill="#dde8f5" />
      <path d="M38 30c0 6 4 10 4 16M50 28v18M62 30c0 6-4 10-4 16" stroke="#1a6db5" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </Base>
  )
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
  return (
    <Base bg="#e3eefb">
      <circle cx="50" cy="50" r="10" fill="#ffffff" stroke="#1a6db5" strokeWidth="2.5" />
      <g fill="#1a6db5">
        <rect x="46" y="26" width="8" height="10" rx="2" />
        <rect x="46" y="64" width="8" height="10" rx="2" />
        <rect x="26" y="46" width="10" height="8" rx="2" />
        <rect x="64" y="46" width="10" height="8" rx="2" />
        <rect x="32" y="32" width="8" height="10" rx="2" transform="rotate(-45 36 37)" />
        <rect x="60" y="32" width="8" height="10" rx="2" transform="rotate(45 64 37)" />
        <rect x="32" y="58" width="8" height="10" rx="2" transform="rotate(45 36 63)" />
        <rect x="60" y="58" width="8" height="10" rx="2" transform="rotate(-45 64 63)" />
      </g>
    </Base>
  )
}
