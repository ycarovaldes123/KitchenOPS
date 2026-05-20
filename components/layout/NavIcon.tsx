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
};

export default function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
