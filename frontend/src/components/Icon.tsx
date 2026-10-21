import type { SVGProps } from 'react'

const paths = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  wallet: 'M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm0 0 11-3v3M15 13.5h2',
  request: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 0v5h5M9 13h6M9 17h4',
  transfer: 'M7 7h13l-4-4M17 17H4l4 4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 4.5a3 3 0 0 1 0 6M18 14.5c2 .6 3 2.4 3 5.5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z',
  key: 'M14.5 9.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zM13.2 12.7 21 20.5M18 17.5l2-2M16 15.5l1.5-1.5',
  rule: 'M12 3v18M5 7h14M5 7l-3 7a3.5 3.5 0 0 0 6 0zm14 0-3 7a3.5 3.5 0 0 0 6 0zM8 21h8',
  audit: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  lock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zm2 0V8a4 4 0 1 1 8 0v3',
  unlock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zm2 0V8a4 4 0 0 1 7.7-1.5',
  arrowLeft: 'M19 12H5m6-6-6 6 6 6',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  arrowDownLeft: 'M17 7 7 17m0-9v9h9',
  arrowUpRight: 'M7 17 17 7m0 9V7H8',
  plus: 'M12 5v14M5 12h14',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  refresh: 'M20 11a8 8 0 0 0-14.6-4.5L4 8m0-4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16m0 4v-4h-4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10',
  send: 'M4 12 20 4l-5 16-3-7z',
  receive: 'M12 4v12m-5-5 5 5 5-5M5 20h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-4-4',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  building: 'M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 10h3a1 1 0 0 1 1 1v10M3 21h18M8 8h4M8 12h4M8 16h4',
  house: 'M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  group: 'M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm12 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM7 20c0-3 2.2-5 5-5s5 2 5 5M2 18c0-2.2 1.6-3.8 4-4M22 18c0-2.2-1.6-3.8-4-4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4.5l3 2',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.5 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2',
  shield: 'M12 3 4 6v6c0 4.8 3.4 8.4 8 9.5 4.6-1.1 8-4.7 8-9.5V6z',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
} as const

export type IconName = keyof typeof paths

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  )
}

/** The CommunitySafe shield, as in the Figma brand mark. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className={className}>
      <path d="M16 2 4 6.5v8.2C4 22.4 9.1 28 16 30c6.9-2 12-7.6 12-15.3V6.5z" fill="#E8661C" stroke="#01191A" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M13 10v12M16 9v2M16 21v2M12 10h6a3 3 0 0 1 0 6h-6m0 0h7a3 3 0 0 1 0 6h-7"
        fill="none"
        stroke="#01191A"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
