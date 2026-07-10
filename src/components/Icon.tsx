import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'book'
  | 'calendar'
  | 'chart'
  | 'chevron-left'
  | 'chevron-right'
  | 'check'
  | 'copy'
  | 'database'
  | 'file'
  | 'film'
  | 'gear'
  | 'heart'
  | 'keyboard'
  | 'mic'
  | 'moon'
  | 'pen'
  | 'play'
  | 'repeat'
  | 'sparkle'
  | 'stop'
  | 'trash'
  | 'upload'
  | 'video'
  | 'watch'
  | 'x'
  | 'eye'
  | 'phone'
  | 'activity'
  | 'cup'
  | 'wine'
  | 'brain'
  | 'refresh'

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
  strokeWidth?: number
}

const ICONS: Record<IconName, ReactNode> = {
  'arrow-left': <path d="M15 18l-6-6 6-6M9 12h12" />,
  'arrow-right': <path d="M9 18l6-6-6-6M15 12H3" />,
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 5.5v15A2.5 2.5 0 0 1 6.5 18H20" />
      <path d="M8 7h7" />
    </>
  ),
  calendar: (
    <>
      <path d="M7 3v3M17 3v3" />
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 10h16M8 14h2M14 14h2M8 17h2" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
      <path d="M7 9l4-3 4 2 4-5" />
    </>
  ),
  'chevron-left': <path d="M15 18l-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  film: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.3M12 18.9v2.3M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.8 12h2.3M18.9 12h2.3M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
      <path d="M7.5 5.6 6.6 3.8M16.5 18.4l.9 1.8M5.6 16.5l-1.8.9M18.4 7.5l1.8-.9" />
    </>
  ),
  heart: (
    <path d="M12 20s-7-4.6-8.8-9.2C1.9 7.4 3.9 4.5 7 4.5c1.8 0 3.2 1 5 3 1.8-2 3.2-3 5-3 3.1 0 5.1 2.9 3.8 6.3C19 15.4 12 20 12 20z" />
  ),
  keyboard: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 14h6M16 14h1" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </>
  ),
  moon: <path d="M20.3 14.8A8.4 8.4 0 0 1 9.2 3.7 8.4 8.4 0 1 0 20.3 14.8z" />,
  pen: (
    <>
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20H4v-4z" />
    </>
  ),
  play: <path d="M8 5v14l11-7z" />,
  repeat: (
    <>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 2.5 14.3 9l6.2 3-6.2 3L12 21.5 9.7 15l-6.2-3 6.2-3z" />
      <path d="M19 3v4M21 5h-4" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 14h10l1-14M9 7V4h6v3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3z" />
    </>
  ),
  watch: (
    <>
      <path d="M8.5 3h7l.7 4.2A5.8 5.8 0 0 1 18 11.5v1A5.8 5.8 0 0 1 16.2 17l-.7 4h-7l-.7-4A5.8 5.8 0 0 1 6 12.5v-1a5.8 5.8 0 0 1 1.8-4.3z" />
      <rect x="8" y="7" width="8" height="10" rx="3" />
      <path d="M11 11h2.5l1.2-1.6" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.8" width="10" height="18.4" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />,
  cup: (
    <>
      <path d="M6 8h10v5a5 5 0 0 1-10 0z" />
      <path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M5 20h12" />
    </>
  ),
  wine: (
    <>
      <path d="M8 3h8l-1 7a4 4 0 0 1-6 0z" />
      <path d="M12 14v7M8.5 21h7" />
    </>
  ),
  brain: (
    <>
      <path d="M9 4.5a3 3 0 0 0-4 2.8 3 3 0 0 0 .8 5.7A3 3 0 0 0 9 19.5z" />
      <path d="M15 4.5a3 3 0 0 1 4 2.8 3 3 0 0 1-.8 5.7A3 3 0 0 1 15 19.5z" />
      <path d="M9 4.5v15M15 4.5v15M9 9h6M9 14h6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.2 9A7 7 0 0 0 6 6.8L4 9" />
      <path d="M5.8 15A7 7 0 0 0 18 17.2l2-2.2" />
    </>
  ),
}

export default function Icon({ name, size = 18, strokeWidth = 1.5, className = '', ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      className={`shrink-0 ${className}`}
      {...props}
    >
      {ICONS[name]}
    </svg>
  )
}
