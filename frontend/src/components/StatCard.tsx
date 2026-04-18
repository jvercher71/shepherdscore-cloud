import type { ReactNode } from 'react'

type IconKind =
  | 'people' | 'calendar' | 'heart' | 'trending-up' | 'dollar'
  | 'clipboard' | 'home' | 'book' | 'document' | 'chart-bar'
  | 'group'

export interface StatCardProps {
  label: string
  value: string | number
  icon?: IconKind
  /** Accent colour applied to the icon glyph and value number. */
  color?: string
  /** Short text shown in the top-right of the card (e.g. "+4 THIS MONTH"). */
  subLabel?: string
  /** Explicit override for the sub-label colour (defaults to the accent). */
  subColor?: string
}

/**
 * Dashboard-style stat card: tinted icon top-left, small sub-label
 * top-right, big value, uppercase label, and a faded watermark icon
 * in the bottom-right. Designed to live inside `.statsGrid`.
 */
export default function StatCard({
  label, value, icon, color = '#0066CC', subLabel, subColor,
}: StatCardProps) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'var(--color-white)', borderRadius: 16, padding: '18px 20px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', minHeight: 130,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        {icon ? (
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: tint(color, 0.10),
            display: 'flex', alignItems: 'center', justifyContent: 'center', color,
            flexShrink: 0,
          }}>
            <Icon kind={icon} size={22} />
          </div>
        ) : <span />}
        {subLabel && (
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
            color: subColor || color, textTransform: 'uppercase',
            textAlign: 'right', lineHeight: 1.3, paddingTop: 6,
          }}>
            {subLabel}
          </span>
        )}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--color-text)', marginTop: 12, position: 'relative', zIndex: 1 }}>
        {value}
      </div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)',
        textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4, position: 'relative', zIndex: 1,
      }}>
        {label}
      </div>

      {/* Watermark */}
      {icon && (
        <div aria-hidden style={{
          position: 'absolute', right: -10, bottom: -14, opacity: 0.08,
          color: '#6B7280', pointerEvents: 'none',
        }}>
          <Icon kind={icon} size={110} />
        </div>
      )}
    </div>
  )
}

function tint(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function Icon({ kind, size = 22 }: { kind: IconKind; size?: number }) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (kind) {
    case 'people':
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'group':
      return (
        <svg {...props}>
          <path d="M9 21v-7a3 3 0 1 0-6 0v7" />
          <path d="M21 21v-7a3 3 0 1 0-6 0v7" />
          <circle cx="6" cy="7" r="3" />
          <circle cx="18" cy="7" r="3" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )
    case 'heart':
      return (
        <svg {...props} fill="currentColor" stroke="none">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      )
    case 'trending-up':
      return (
        <svg {...props}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      )
    case 'dollar':
      return (
        <svg {...props}>
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      )
    case 'clipboard':
      return (
        <svg {...props}>
          <path d="M9 2h6a2 2 0 0 1 2 2v2h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1V4a2 2 0 0 1 2-2z" />
        </svg>
      )
    case 'home':
      return (
        <svg {...props}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" />
        </svg>
      )
    case 'book':
      return (
        <svg {...props}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z" />
        </svg>
      )
    case 'document':
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )
    case 'chart-bar':
      return (
        <svg {...props}>
          <line x1="12" y1="20" x2="12" y2="10" />
          <line x1="18" y1="20" x2="18" y2="4" />
          <line x1="6" y1="20" x2="6" y2="16" />
        </svg>
      )
  }
}
