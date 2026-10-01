import type { CSSProperties, ReactNode } from 'react';
export type IconName = 'home' | 'calendar' | 'users' | 'box' | 'message' | 'megaphone' | 'settings' | 'search' | 'bell' | 'chevron' | 'arrow' | 'check' | 'clock' | 'sparkles' | 'refresh' | 'close' | 'menu' | 'store' | 'help' | 'file' | 'alert' | 'truck' | 'phone' | 'chevronDown' | 'database' | 'activity' | 'external' | 'shield' | 'star' | 'logout';
const shapes: Record<IconName, ReactNode> = {
  star: <path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.3-5.7-3-5.7 3 1.1-6.3L3.2 9.6l6.3-.9Z" fill="currentColor" strokeWidth="1"/>,
  logout: <><path d="M9 3H4v18h5M13 8l5 4-5 4M8 12h13"/></>,
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1Z"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2M8 18h2"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m3 10v-3a5 5 0 0 0-2-4"/></>,
  box: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v10l9 5 9-5V8M12 13v10M7.5 5.5l9 5"/></>,
  message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M7 8h10M7 12h7"/></>,
  megaphone: <><path d="m3 10 14-6v16L3 14v-4Zm14-2 4 2v4l-4 2M7 16l2 6h4l-3-5"/></>,
  settings: <><path d="m9 3-.5 3-3 1-2.5-1.5-2 3L3 11v3l-2 2.5 2 3L6 18l2.5 1L9 22h4l.5-3 3-1 2.5 1.5 2-3-2-2.5v-3l2-2.5-2-3L16 7l-2.5-1L13 3Z" transform="translate(1 -1) scale(.94)"/><circle cx="12" cy="12" r="3"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10 21h4"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>, chevronDown: <path d="m6 9 6 6 6-6"/>,
  arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
  check: <path d="m5 12 4 4L19 6"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  sparkles: <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3ZM20 2v4M18 4h4"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>, menu: <path d="M3 6h18M3 12h18M3 18h18"/>,
  store: <><path d="m4 3-2 6a4 4 0 0 0 7 2 4 4 0 0 0 6 0 4 4 0 0 0 7-2l-2-6ZM4 13v8h16v-8M9 21v-6h6v6"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01"/></>,
  file: <><path d="M14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9Zm0 0v7h7M7 13h10M7 17h6"/></>,
  alert: <><path d="m10 3-9 16a1 1 0 0 0 1 2h20a1 1 0 0 0 1-2L14 3a2 2 0 0 0-4 0Z" transform="translate(1 0) scale(.92)"/><path d="M12 8v5M12 17h.01"/></>,
  truck: <><path d="M1 4h13v13H1ZM14 9h5l4 5v3h-9"/><circle cx="5" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>,
  phone: <path d="m5 2 4 4-2 3a15 15 0 0 0 8 8l3-2 4 4-2 3C9 22 2 15 2 5l3-3Z"/>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/></>,
  activity: <path d="M2 12h5l3-8 4 16 3-8h5"/>,
  external: <><path d="M14 3h7v7M10 14 21 3M9 3H3v18h18v-6"/></>,
  shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/></>,
};
export function Icon({ name, size = 20, className = '', style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>{shapes[name]}</svg>;
}
