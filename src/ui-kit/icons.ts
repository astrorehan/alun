/**
 * ALUN Arcade Gloss UI Kit — Cel-Shaded Outlined Cartoon Vector Icon Library.
 * Every icon uses bold #0d121d outlines, crisp highlights, and vivid multi-tone fills
 * to match the exact visual fidelity of glossy Roblox simulator UIs.
 */

export type UiIconName =
  | 'coin'
  | 'wave'
  | 'width'
  | 'power'
  | 'charge'
  | 'echo'
  | 'resonance'
  | 'energy'
  | 'regen'
  | 'combo'
  | 'magnet'
  | 'sonar'
  | 'buoy'
  | 'net'
  | 'density'
  | 'rarity'
  | 'mangrove'
  | 'boat'
  | 'fire'
  | 'boss'
  | 'core'
  | 'sun'
  | 'sunset'
  | 'storm'
  | 'dawn'
  | 'lock'
  | 'trophy'
  | 'star_on'
  | 'star_off'
  | 'arrow_right'
  | 'sparkle'
  | 'close'
  | 'check'
  | 'sound_on'
  | 'sound_off'
  | 'shop'
  | 'tree'
  | 'play'
  | 'info'
  | 'swipe'
  | 'settings'
  | 'dolphin'
  | 'wrench'
  | 'rope'
  | 'raider'
  | 'float'
  | 'drum'
  | 'pad'
  | 'basket'
  | 'beacon'
  | 'radio'
  | 'eco'
  | 'journal'
  | 'warn';

const INK = '#0d121d';

export function getUiIconSvg(name: UiIconName, className = ''): string {
  const cls = className ? ` class="${className}"` : '';

  switch (name) {
    case 'coin':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="21" r="15.5" fill="#d97706" stroke="${INK}" stroke-width="3.2"/>
        <circle cx="20" cy="18.5" r="14.5" fill="#ffe14a" stroke="${INK}" stroke-width="3.2"/>
        <circle cx="20" cy="18.5" r="9.8" fill="#f5b318" stroke="${INK}" stroke-width="2.2"/>
        <path d="M13 11.5C15.2 8.8 18.6 7.5 22 8" stroke="#fff8c4" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M20 11.5L22.5 16L27 17.5L22.5 20L20 25L17.5 20L13 17.5L17.5 16L20 11.5Z" fill="#fff4a8" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>`;

    case 'core':
    case 'wave':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M5 24C8 14 15 10 23 11C28 11.6 32 14.5 34 18C30 17 27 18.5 26 21C29 21 33 22 35 25C31 30 24 32 16 32C10 32 6 29 5 24Z" fill="#4ce3ff" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M9 22C12 16 17 14 23 14.5" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
        <circle cx="31" cy="12" r="3" fill="#b8fbff" stroke="${INK}" stroke-width="2.2"/>
      </svg>`;

    case 'width':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M4 26C9 15 17 13 24 16C28 17.8 31 20 36 24C31 29 24 31 16 31C10 31 6 29 4 26Z" fill="#4ce3ff" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M9 24C13 18.5 19 17.5 25 19.5" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round"/>
        <path d="M12 10H28" stroke="#ffe759" stroke-width="4" stroke-linecap="round"/>
        <path d="M5 10L12 5.5V14.5L5 10Z" fill="#ffe759" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M35 10L28 5.5V14.5L35 10Z" fill="#ffe759" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      </svg>`;

    case 'power':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M6 27C10 13 21 10 31 15L34 10L36 23L23 24L27 19C20 17 14 21 12 29L6 27Z" fill="#3cd7ff" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M10 24C13 17 19 15 24 16" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/>
      </svg>`;

    case 'charge':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="13.5" fill="#2cc2ff" stroke="${INK}" stroke-width="3.2"/>
        <circle cx="20" cy="20" r="7.5" fill="#fff078" stroke="${INK}" stroke-width="2.6"/>
        <path d="M20 3V8M20 32V37M3 20H8M32 20H37" stroke="#ffe554" stroke-width="3.6" stroke-linecap="round"/>
      </svg>`;

    case 'echo':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M8 12C14 16 14 24 8 28" stroke="#8ff8ff" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M17 8C25 14 25 26 17 32" stroke="#42d4ff" stroke-width="4.8" stroke-linecap="round"/>
        <path d="M26 5C36 13 36 27 26 35" stroke="#1e8cff" stroke-width="5" stroke-linecap="round"/>
        <path d="M8 12C14 16 14 24 8 28M17 8C25 14 25 26 17 32M26 5C36 13 36 27 26 35" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
      </svg>`;

    case 'resonance':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <circle cx="15" cy="20" r="10.5" fill="#46dcff" fill-opacity="0.88" stroke="${INK}" stroke-width="3"/>
        <circle cx="25" cy="20" r="10.5" fill="#ffdf4d" fill-opacity="0.88" stroke="${INK}" stroke-width="3"/>
        <path d="M20 11L22.2 17.5L28 20L22.2 22.5L20 29L17.8 22.5L12 20L17.8 17.5L20 11Z" fill="#ffffff" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
      </svg>`;

    case 'energy':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M23 4L8 22H19L16 36L32 18H21L23 4Z" fill="#ffe54c" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M21 9L13 19.5H19" stroke="#fffbe0" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`;

    case 'regen':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M31 19A11 11 0 1 1 26 10" stroke="#ffb830" stroke-width="6" stroke-linecap="round"/>
        <path d="M31 19A11 11 0 1 1 26 10" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M25 4L35 11L24 15L25 4Z" fill="#ffe859" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
      </svg>`;

    case 'combo':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M6 29L15 19L21 24L32 11" stroke="#ffe54c" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M24 10H34V20" fill="#ff9f24" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="15" cy="19" r="3.5" fill="#70f562" stroke="${INK}" stroke-width="2.4"/>
        <circle cx="21" cy="24" r="3.5" fill="#52e2ff" stroke="${INK}" stroke-width="2.4"/>
      </svg>`;

    case 'magnet':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M10 10V21A10 10 0 0 0 30 21V10H24V21A4 4 0 0 1 16 21V10H10Z" fill="#4bf2e0" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <rect x="10" y="7" width="6" height="6" rx="1.5" fill="#ffe554" stroke="${INK}" stroke-width="2.6"/>
        <rect x="24" y="7" width="6" height="6" rx="1.5" fill="#ffe554" stroke="${INK}" stroke-width="2.6"/>
      </svg>`;

    case 'sonar':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="14.5" fill="#185970" stroke="${INK}" stroke-width="3.2"/>
        <circle cx="20" cy="20" r="9" stroke="#5af7ee" stroke-width="2.2" stroke-dasharray="4 3"/>
        <path d="M20 20L30 11" stroke="#85ffea" stroke-width="3.4" stroke-linecap="round"/>
        <circle cx="20" cy="20" r="3.5" fill="#ffe857" stroke="${INK}" stroke-width="2.2"/>
        <circle cx="28" cy="25" r="2.6" fill="#74f664"/>
      </svg>`;

    case 'buoy':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M12 24H28L31 32H9L12 24Z" fill="#ff6654" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M16 14H24L26 24H14L16 14Z" fill="#ffffff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="20" cy="10" r="4.5" fill="#5cf7ff" stroke="${INK}" stroke-width="2.8"/>
      </svg>`;

    case 'net':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M8 7V33" stroke="#d9934c" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M10 9C24 9 32 14 32 20C32 26 24 31 10 31V9Z" fill="#82f2b5" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M16 10.5V29.5M23 12.5V27.5M10 20H31" stroke="#186b42" stroke-width="2.2"/>
      </svg>`;

    case 'density':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <rect x="6" y="18" width="13" height="14" rx="4" fill="#63e6ff" stroke="${INK}" stroke-width="3"/>
        <rect x="21" y="17" width="13" height="15" rx="4" fill="#73f574" stroke="${INK}" stroke-width="3"/>
        <rect x="13" y="7" width="14" height="14" rx="4" fill="#ffe354" stroke="${INK}" stroke-width="3"/>
        <path d="M17 11H23" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;

    case 'rarity':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M12 8H28L35 17L20 34L5 17L12 8Z" fill="#ff73dc" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M12 8L15 17L20 34L25 17L28 8" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M5 17H35" stroke="${INK}" stroke-width="2.4"/>
        <path d="M15 17L20 9L25 17H15Z" fill="#ffe0fa"/>
      </svg>`;

    case 'mangrove':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M14 34L19 23M26 34L21 23M20 34V22" stroke="#b86c35" stroke-width="3.6" stroke-linecap="round"/>
        <circle cx="13" cy="18" r="7.5" fill="#2cc95a" stroke="${INK}" stroke-width="3"/>
        <circle cx="27" cy="18" r="7.5" fill="#2cc95a" stroke="${INK}" stroke-width="3"/>
        <circle cx="20" cy="12.5" r="8.5" fill="#68f571" stroke="${INK}" stroke-width="3"/>
        <path d="M16 9.5C18 8 21 8 23 9.5" stroke="#d8ffd4" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`;

    case 'boat':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M19 6L31 23H19V6Z" fill="#ffffff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M17 10L9 23H17V10Z" fill="#ffe359" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M5 25H35L30 33H10L5 25Z" fill="#e67e35" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
      </svg>`;

    case 'fire':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M20 5C25 11 32 16 32 24C32 30.6 26.6 35 20 35C13.4 35 8 30.6 8 24C8 17 13 13 15 10C15 14 17 15 17 15C17 10 18.5 7 20 5Z" fill="#ff5f38" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M20 18C23 21 25 24 25 27.5C25 30.5 22.8 32.5 20 32.5C17.2 32.5 15 30.5 15 27.5C15 24 17.5 21 20 18Z" fill="#ffe854" stroke="${INK}" stroke-width="2.2"/>
      </svg>`;

    case 'boss':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <rect x="13" y="10" width="14" height="12" rx="2" fill="#5e6a82" stroke="${INK}" stroke-width="3"/>
        <rect x="22" y="6" width="5" height="6" fill="#ff5c5c" stroke="${INK}" stroke-width="2.5"/>
        <path d="M4 22H36L31 32H9L4 22Z" fill="#d9323f" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <circle cx="14" cy="27" r="2.2" fill="#ffe857"/>
        <circle cx="20" cy="27" r="2.2" fill="#ffe857"/>
        <circle cx="26" cy="27" r="2.2" fill="#ffe857"/>
      </svg>`;

    case 'sun':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M20 4V8M20 32V36M4 20H8M32 20H36M8.7 8.7L11.5 11.5M28.5 28.5L31.3 31.3M31.3 8.7L28.5 11.5M11.5 28.5L8.7 31.3" stroke="#ffe54c" stroke-width="3.8" stroke-linecap="round"/>
        <circle cx="20" cy="20" r="9.5" fill="#ffd438" stroke="${INK}" stroke-width="3"/>
        <circle cx="17" cy="17" r="3" fill="#fff6b8"/>
      </svg>`;

    case 'sunset':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M9 26A11 11 0 0 1 31 26Z" fill="#ff9436" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M5 29H35" stroke="#ffe45e" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M10 34H30" stroke="#ff7452" stroke-width="3.2" stroke-linecap="round"/>
      </svg>`;

    case 'storm':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M12 25H30C33.3 25 36 22.5 36 19.3C36 16.4 33.8 14 31 13.7C30 9.8 26.5 7 22.3 7C17.8 7 14 10.3 13.4 14.6C9.8 15 7 17.8 7 21.2C7 23.4 9.2 25 12 25Z" fill="#5e76a8" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M21 21L16 29H21L18 36L27 26H22L24 21H21Z" fill="#ffe84c" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      </svg>`;

    case 'dawn':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="22" r="9.5" fill="#ffe678" stroke="${INK}" stroke-width="3"/>
        <path d="M6 28C12 25 28 25 34 28" stroke="#5cf2e2" stroke-width="4" stroke-linecap="round"/>
        <path d="M20 5V9M9 11L12 14M31 11L28 14" stroke="#ffe866" stroke-width="3.4" stroke-linecap="round"/>
      </svg>`;

    case 'lock':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M13 18V13A7 7 0 0 1 27 13V18" stroke="#dce5f2" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M13 18V13A7 7 0 0 1 27 13V18" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
        <rect x="8" y="17" width="24" height="18" rx="5" fill="#ffb830" stroke="${INK}" stroke-width="3.2"/>
        <circle cx="20" cy="25" r="3" fill="${INK}"/>
        <path d="M20 27V31" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
      </svg>`;

    case 'trophy':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M10 9H30V18C30 23.5 25.5 27 20 27C14.5 27 10 23.5 10 18V9Z" fill="#ffdf47" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M10 12H6C6 18 8 21 11.5 21M30 12H34C34 18 32 21 28.5 21" stroke="#f5a616" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M20 27V32M13 33H27" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
        <path d="M15 13H21" stroke="#fff9c4" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`;

    case 'star_on':
      return `<svg${cls} viewBox="0 0 28 28" fill="none">
        <path d="M14 2.5L17.6 9.8L25.6 11L19.8 16.6L21.2 24.6L14 20.8L6.8 24.6L8.2 16.6L2.4 11L10.4 9.8L14 2.5Z" fill="#ffe142" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M14 6L15.8 10.5L12 10.5L14 6Z" fill="#fff9c4"/>
      </svg>`;

    case 'star_off':
      return `<svg${cls} viewBox="0 0 28 28" fill="none">
        <path d="M14 2.5L17.6 9.8L25.6 11L19.8 16.6L21.2 24.6L14 20.8L6.8 24.6L8.2 16.6L2.4 11L10.4 9.8L14 2.5Z" fill="#3a435a" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
      </svg>`;

    case 'arrow_right':
      return `<svg${cls} viewBox="0 0 28 24" fill="none">
        <path d="M3 8.5H14.5V4L25 12L14.5 20V15.5H3V8.5Z" fill="#ffe142" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
      </svg>`;

    case 'sparkle':
      return `<svg${cls} viewBox="0 0 24 24" fill="none">
        <path d="M12 1.5L14.5 9.5L22.5 12L14.5 14.5L12 22.5L9.5 14.5L1.5 12L9.5 9.5L12 1.5Z" fill="#fff7b8" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>`;

    case 'close':
      return `<svg${cls} viewBox="0 0 28 28" fill="none">
        <path d="M7 7L21 21M21 7L7 21" stroke="${INK}" stroke-width="7.2" stroke-linecap="round"/>
        <path d="M7 7L21 21M21 7L7 21" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
      </svg>`;

    case 'check':
      return `<svg${cls} viewBox="0 0 28 28" fill="none">
        <path d="M5 14.5L11.5 21L23 8" stroke="${INK}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 14.5L11.5 21L23 8" stroke="#75ff64" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

    case 'sound_on':
      return `<svg${cls} viewBox="0 0 32 32" fill="none">
        <path d="M5 12H11L18 6V26L11 20H5V12Z" fill="#68e3ff" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
        <path d="M22 11.5C24.2 13.7 24.2 18.3 22 20.5M25.5 8.5C29.3 12.3 29.3 19.7 25.5 23.5" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
      </svg>`;

    case 'sound_off':
      return `<svg${cls} viewBox="0 0 32 32" fill="none">
        <path d="M5 12H11L18 6V26L11 20H5V12Z" fill="#9ba8be" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
        <path d="M22 12L29 19M29 12L22 19" stroke="#ff626d" stroke-width="3.6" stroke-linecap="round"/>
      </svg>`;

    case 'shop':
      return `<svg${cls} viewBox="0 0 36 36" fill="none">
        <path d="M6 15H30V30H6V15Z" fill="#ffe156" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M4 15L7 7H29L32 15C30 18 26 18 24 15C22 18 18 18 18 15C18 18 14 18 12 15C10 18 6 18 4 15Z" fill="#ff6a47" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
        <rect x="14" y="21" width="8" height="9" rx="1.5" fill="#46c9ff" stroke="${INK}" stroke-width="2.4"/>
      </svg>`;

    case 'tree':
      return `<svg${cls} viewBox="0 0 36 36" fill="none">
        <path d="M18 18L9 9M18 18L27 9M18 18L9 27M18 18L27 27" stroke="#9bf5ff" stroke-width="3.6" stroke-linecap="round"/>
        <circle cx="9" cy="9" r="4.2" fill="#5ad6ff" stroke="${INK}" stroke-width="2.5"/>
        <circle cx="27" cy="9" r="4.2" fill="#ffe254" stroke="${INK}" stroke-width="2.5"/>
        <circle cx="9" cy="27" r="4.2" fill="#5df2d4" stroke="${INK}" stroke-width="2.5"/>
        <circle cx="27" cy="27" r="4.2" fill="#70f566" stroke="${INK}" stroke-width="2.5"/>
        <circle cx="18" cy="18" r="5.5" fill="#ffffff" stroke="${INK}" stroke-width="2.8"/>
      </svg>`;

    case 'play':
      return `<svg${cls} viewBox="0 0 32 32" fill="none">
        <path d="M9 6L26 16L9 26V6Z" fill="#ffffff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      </svg>`;

    case 'info':
      return `<svg${cls} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="12" fill="#63d6ff" stroke="${INK}" stroke-width="3"/>
        <circle cx="16" cy="10.5" r="2" fill="#ffffff"/>
        <path d="M16 15V22" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round"/>
      </svg>`;

    case 'swipe':
      return `<svg${cls} viewBox="0 0 36 36" fill="none">
        <path d="M7 22C13 13 22 11 29 14" stroke="#68eeff" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M24 8L31 14L23 19" fill="#ffe457" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
        <circle cx="9" cy="23" r="4" fill="#ffffff" stroke="${INK}" stroke-width="2.6"/>
      </svg>`;

    case 'dolphin':
      return `<svg${cls} viewBox="0 0 36 36" fill="none">
        <path d="M16 12.4Q15.2 7.6 13 6.2Q19.4 6.8 21.8 11.4Z" fill="#3f9fd6" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M9.4 20.6L3.2 15.8Q4.6 21 3.4 26.4Z" fill="#3f9fd6" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M8.2 20.2C12 12.4 22 9.2 28 12.6C30 13.6 31.8 14.4 33.4 15.4C32 16.8 30 17.2 28 17.2C24 22.2 15 24.6 8.4 22.4Z" fill="#5ec2ef" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M11 21.4C16 22.8 23 21.4 27.4 17.6" stroke="#d8f4ff" stroke-width="2" stroke-linecap="round"/>
        <path d="M18.2 19.8Q19.4 23.6 16.2 25.6Q16.4 22 15.4 20.2Z" fill="#3f9fd6" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        <circle cx="26.2" cy="14.2" r="1.3" fill="${INK}"/>
      </svg>`;

    case 'wrench':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M31.5 5.5L26.4 10.6L29.4 13.6L34.5 8.5C36.6 13 34.4 18.2 29.6 19.4C28 19.8 26.4 19.7 25 19.2L12.6 31.6C10.8 33.4 8 33.4 6.4 31.6C4.6 30 4.6 27.2 6.4 25.4L18.8 13C17.6 9 20 4.6 24.6 3.6C27 3 29.6 3.8 31.5 5.5Z" fill="#cfe0ee" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="9.6" cy="28.6" r="2.2" fill="${INK}"/>
        <path d="M22 8C23.4 6.6 25 6 26.6 6" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`;

    case 'rope':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M5 12C13 4 19 20 27 12C31 8 35 10 36 14" stroke="${INK}" stroke-width="8.4" stroke-linecap="round"/>
        <path d="M5 12C13 4 19 20 27 12C31 8 35 10 36 14" stroke="#e2b56a" stroke-width="4.6" stroke-linecap="round"/>
        <path d="M5 27C13 19 19 35 27 27C31 23 35 25 36 29" stroke="${INK}" stroke-width="8.4" stroke-linecap="round"/>
        <path d="M5 27C13 19 19 35 27 27C31 23 35 25 36 29" stroke="#c8924a" stroke-width="4.6" stroke-linecap="round"/>
        <path d="M9 10.5L12 13M18 13L21 15.4M9 25.5L12 28M18 28L21 30.4" stroke="#7a5426" stroke-width="2" stroke-linecap="round"/>
      </svg>`;

    case 'raider':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M4 26H36L31 34H9L4 26Z" fill="#7a3a2a" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M19 4V26" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M19 5L33 8L29 12L33 15L28 18L31 22H19V5Z" fill="#e0453a" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
        <path d="M17 9L8 20L12 19L11 23H17V9Z" fill="#c8c0ae" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
      </svg>`;

    case 'float':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M20 6V2.5" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
        <ellipse cx="20" cy="20" rx="12.5" ry="14" fill="#ff7a2a" stroke="${INK}" stroke-width="3.2"/>
        <path d="M8 16.5C15 19.5 25 19.5 32 16.5V23.5C25 26.5 15 26.5 8 23.5V16.5Z" fill="#fff6e4" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M13 11.5C14.6 9.8 16.6 8.8 19 8.6" stroke="#ffd0a8" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M6 34C12 31 16 37 20 34C24 31 28 37 34 34" stroke="#4ce3ff" stroke-width="3" stroke-linecap="round"/>
      </svg>`;

    case 'drum':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M9 9V31C9 34 14 36 20 36C26 36 31 34 31 31V9" fill="#f2b62c" stroke="${INK}" stroke-width="3.2"/>
        <ellipse cx="20" cy="9" rx="11" ry="4.6" fill="#ffd95e" stroke="${INK}" stroke-width="3"/>
        <path d="M9 16.5C12 19 28 19 31 16.5M9 25.5C12 28 28 28 31 25.5" stroke="${INK}" stroke-width="2.6"/>
        <path d="M20 18.5C23 22 24 23.4 24 25.2A4 4 0 0 1 16 25.2C16 23.4 17 22 20 18.5Z" fill="#2b2236" stroke="${INK}" stroke-width="1.6"/>
      </svg>`;

    case 'pad':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <rect x="4" y="12" width="32" height="17" rx="6" fill="#f2f7fb" stroke="${INK}" stroke-width="3.2"/>
        <path d="M11 12V29M18 12V29M25 12V29M32 13V28" stroke="#a9c3d6" stroke-width="2.4"/>
        <path d="M8 16.5H30" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M20 31.5C22.6 34.4 23.4 35.6 23.4 36.6A3.4 3.4 0 0 1 16.6 36.6C16.6 35.6 17.4 34.4 20 31.5Z" fill="#2b2236"/>
      </svg>`;

    case 'basket':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M10 17C10 7 30 7 30 17" stroke="${INK}" stroke-width="6"/>
        <path d="M10 17C10 7 30 7 30 17" stroke="#c8924a" stroke-width="2.6"/>
        <path d="M5 17H35L31 34H9L5 17Z" fill="#e2b56a" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M8 23H32M9 28.5H31M14 18L16 33M26 18L24 33" stroke="#8a5a24" stroke-width="2.2"/>
        <path d="M12 16C14 11 20 11 22 15L26 12V18H12Z" fill="#8fd0f0" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      </svg>`;

    case 'beacon':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M6 10L14 13M6 18L14 16M34 10L26 13M34 18L26 16" stroke="#ffe45a" stroke-width="3" stroke-linecap="round"/>
        <path d="M14 35L16 19H24L26 35Z" fill="#fff6e4" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M15.2 25H24.8L25.4 30H14.6Z" fill="#e0453a"/>
        <rect x="14" y="9" width="12" height="10" rx="2" fill="#ffd94a" stroke="${INK}" stroke-width="3"/>
        <path d="M12.5 9.5L20 3.5L27.5 9.5Z" fill="#e0453a" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
        <path d="M9 35.5H31" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
      </svg>`;

    case 'radio':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M11 13L27 4" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
        <rect x="5" y="13" width="30" height="21" rx="5" fill="#d8843a" stroke="${INK}" stroke-width="3.2"/>
        <circle cx="14" cy="23.5" r="6" fill="#3a2a1c" stroke="${INK}" stroke-width="2.4"/>
        <circle cx="14" cy="23.5" r="2.6" fill="#8a6a4a"/>
        <rect x="23" y="17.5" width="9" height="5" rx="1.5" fill="#9ff0c0" stroke="${INK}" stroke-width="2"/>
        <circle cx="25.5" cy="28" r="2" fill="#fff6e4" stroke="${INK}" stroke-width="1.6"/>
        <circle cx="31" cy="28" r="2" fill="#ff6a5a" stroke="${INK}" stroke-width="1.6"/>
      </svg>`;

    case 'eco':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M4 30C10 26 14 32 20 29C26 26 30 32 36 29V35H4V30Z" fill="#f2d28a" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
        <path d="M20 29C11 27 8 19 11 8C21 8 27 14 24 24C23.4 26 22 28 20 29Z" fill="#5fd86a" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M14 12C17 17 19 22 20 28" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M27 24C28 19 31 16 35 15C36 20 34 25 28 27" fill="#9bea6a" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
      </svg>`;

    case 'journal':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <rect x="7" y="4" width="27" height="32" rx="4" fill="#2f8fc8" stroke="${INK}" stroke-width="3.2"/>
        <path d="M13 4V36" stroke="${INK}" stroke-width="2.8"/>
        <rect x="17" y="10" width="13" height="9" rx="2" fill="#fff6e4" stroke="${INK}" stroke-width="2.4"/>
        <path d="M20 13.2H27M20 16H25" stroke="#8a6a4a" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M4.5 11H9M4.5 20H9M4.5 29H9" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      </svg>`;

    case 'warn':
      return `<svg${cls} viewBox="0 0 40 40" fill="none">
        <path d="M20 5L37 34H3L20 5Z" fill="#ffd94a" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M20 15V24" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="20" cy="29" r="2.4" fill="${INK}"/>
      </svg>`;

    case 'settings':
      return `<svg${cls} viewBox="0 0 36 36" fill="none">
        <path d="M15.4 4.5H20.6L21.7 8.2C22.8 8.6 23.8 9.2 24.7 9.9L28.4 8.7L31 13.2L28.2 15.9C28.4 17.3 28.4 18.7 28.2 20.1L31 22.8L28.4 27.3L24.7 26.1C23.8 26.8 22.8 27.4 21.7 27.8L20.6 31.5H15.4L14.3 27.8C13.2 27.4 12.2 26.8 11.3 26.1L7.6 27.3L5 22.8L7.8 20.1C7.6 18.7 7.6 17.3 7.8 15.9L5 13.2L7.6 8.7L11.3 9.9C12.2 9.2 13.2 8.6 14.3 8.2L15.4 4.5Z" fill="#7be8ff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="18" cy="18" r="5.2" fill="#ffe554" stroke="${INK}" stroke-width="2.8"/>
      </svg>`;
  }
}
