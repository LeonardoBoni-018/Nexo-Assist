/** Marca da Nexo (o "N" do protótipo). */
export function NexoMark({ size = 20, color = '#037AF6' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 21V3h4.2l9.6 11.4V3H21v18h-4.2L7.2 9.6V21H3z" fill={color} />
    </svg>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

const AVATAR_TONES = [
  'bg-primary-soft text-primary-text',
  'bg-warning-soft text-warning-text',
  'bg-violet-soft text-violet-text',
  'bg-success-soft text-success-text',
  'bg-danger-soft text-danger-text',
];

export function Avatar({ name, size = 34, online }: { name: string; size?: number; online?: boolean }) {
  const tone = AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-bold ${tone}`} style={{ width: size, height: size, fontSize: size * 0.37 }}>
      {initials(name)}
      {online ? <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-paper bg-success" /> : null}
    </span>
  );
}
