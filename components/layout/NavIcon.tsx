const PATHS: Record<string, string> = {
  flame:    'M12 2C9.5 5 7 8.5 7 11.5a5 5 0 0010 0C17 8.5 14.5 5 12 2z',
  utensils: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3v7',
  trending: 'M22 17L13.5 8.5l-5 5L2 7M16 17h6M22 11v6',
  clock:    'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  grid:     'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  barchart: 'M18 20V10M12 20V4M6 20v-6',
  dollar:   'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  settings: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 8a4 4 0 100 8 4 4 0 000-8z',
  // Acciones (Maestros y demás módulos)
  search:   'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  x:        'M18 6L6 18M6 6l12 12',
  plus:     'M12 5v14M5 12h14',
  edit:     'M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
  copy:     'M9 9h11v11H9zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1',
  ban:      'M12 22a10 10 0 100-20 10 10 0 000 20zM4.93 4.93l14.14 14.14',
  check:    'M20 6L9 17l-5-5',
  trash:    'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6',
  upload:   'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  refresh:  'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
  history:  'M3 3v5h5M3.05 13A9 9 0 106 5.3L3 8M12 7v5l4 2',
  chevron:  'M9 18l6-6-6-6',
  back:     'M15 18l-6-6 6-6',
};

export default function NavIcon({ name, size = 18, strokeWidth = 2 }: { name: string; size?: number; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true" focusable="false"
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
