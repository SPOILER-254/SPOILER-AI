import React from 'react';

const PLATFORM_META: Record<string, { label: string; color: string; bg: string; glyph: string }> = {
  whatsapp: { label: 'WhatsApp', color: '#25D366', bg: 'bg-[#25D366]/12 border-[#25D366]/30', glyph: 'WA' },
  telegram: { label: 'Telegram', color: '#26A5E4', bg: 'bg-[#26A5E4]/12 border-[#26A5E4]/30', glyph: 'TG' },
  instagram: { label: 'Instagram', color: '#E4405F', bg: 'bg-[#E4405F]/12 border-[#E4405F]/30', glyph: 'IG' },
  facebook: { label: 'Facebook', color: '#1877F2', bg: 'bg-[#1877F2]/12 border-[#1877F2]/30', glyph: 'FB' },
  messenger: { label: 'Messenger', color: '#00B2FF', bg: 'bg-[#00B2FF]/12 border-[#00B2FF]/30', glyph: 'MS' },
  tiktok: { label: 'TikTok', color: '#FF0050', bg: 'bg-[#FF0050]/12 border-[#FF0050]/30', glyph: 'TT' },
  x: { label: 'X / Twitter', color: '#F4F4F6', bg: 'bg-zinc-500/15 border-zinc-500/30', glyph: 'X' },
  discord: { label: 'Discord', color: '#5865F2', bg: 'bg-[#5865F2]/12 border-[#5865F2]/30', glyph: 'DC' },
  snapchat: { label: 'Snapchat', color: '#FFFC00', bg: 'bg-[#FFFC00]/10 border-[#FFFC00]/30', glyph: 'SC' },
  youtube: { label: 'YouTube', color: '#FF0000', bg: 'bg-[#FF0000]/12 border-[#FF0000]/30', glyph: 'YT' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2', bg: 'bg-[#0A66C2]/12 border-[#0A66C2]/30', glyph: 'IN' },
  reddit: { label: 'Reddit', color: '#FF4500', bg: 'bg-[#FF4500]/12 border-[#FF4500]/30', glyph: 'RD' },
  pinterest: { label: 'Pinterest', color: '#E60023', bg: 'bg-[#E60023]/12 border-[#E60023]/30', glyph: 'PT' },
  threads: { label: 'Threads', color: '#E4E4E7', bg: 'bg-zinc-400/12 border-zinc-500/30', glyph: '@' },
  gmail: { label: 'Gmail', color: '#EA4335', bg: 'bg-[#EA4335]/12 border-[#EA4335]/30', glyph: 'GM' },
  slack: { label: 'Slack', color: '#E01E5A', bg: 'bg-[#E01E5A]/12 border-[#E01E5A]/30', glyph: 'SL' },
};

export function PlatformGlyph({ platform, size = 'md' }: { platform: string; size?: 'sm' | 'md' | 'lg' }) {
  const key = platform.toLowerCase();
  const meta = PLATFORM_META[key] || { label: platform, color: '#EF4444', bg: 'bg-red-500/12 border-red-500/30', glyph: platform.slice(0, 2).toUpperCase() };
  const dims = size === 'sm' ? 'w-7 h-7 text-[11px]' : size === 'lg' ? 'w-11 h-11 text-sm' : 'w-9 h-9 text-xs';

  return (
    <div
      className={`${dims} ${meta.bg} border rounded-lg flex items-center justify-center shrink-0 font-display font-bold tracking-tight`}
      style={{ color: meta.color }}
      aria-label={meta.label}
      title={meta.label}
    >
      {key === 'whatsapp' && (
        <svg viewBox="0 0 24 24" className="w-4/6 h-4/6 fill-current" aria-hidden="true">
          <path d="M12.03 2a9.97 9.97 0 0 0-8.6 15.02L2 22l5.12-1.34A9.97 9.97 0 1 0 12.03 2Zm5.8 14.08c-.25.7-1.42 1.33-1.97 1.41-.51.08-1.15.11-1.85-.11-.43-.14-.98-.32-1.69-.63-2.98-1.29-4.92-4.29-5.07-4.49-.15-.2-1.21-1.61-1.21-3.07 0-1.46.76-2.18 1.04-2.47.27-.3.59-.37.79-.37h.57c.18 0 .43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.38-.45.51-.15.15-.3.31-.13.61.18.3.78 1.29 1.68 2.09 1.15 1.03 2.13 1.35 2.43 1.5.3.15.47.12.64-.08.18-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.74.82 2.04.97.3.15.5.22.57.34.08.12.08.7-.17 1.4Z" />
        </svg>
      )}
      {key === 'telegram' && (
        <svg viewBox="0 0 24 24" className="w-4/6 h-4/6 fill-current" aria-hidden="true">
          <path d="M21.9 4.4 18.6 19.9c-.25 1.1-.9 1.37-1.82.85l-5.02-3.7-2.42 2.33c-.27.27-.5.5-1.02.5l.36-5.13 9.34-8.44c.4-.36-.09-.56-.63-.2L5.85 13.38.9 11.83c-1.08-.34-1.1-1.08.23-1.6L20.47 2.8c.9-.34 1.68.22 1.43 1.6Z" />
        </svg>
      )}
      {key === 'instagram' && (
        <svg viewBox="0 0 24 24" className="w-4/6 h-4/6 stroke-current fill-none" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" className="fill-current" />
        </svg>
      )}
      {key === 'facebook' && (
        <svg viewBox="0 0 24 24" className="w-4/6 h-4/6 fill-current" aria-hidden="true">
          <path d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.326-.043-1.557-.14-2.857-.14C11.928 2 10 3.657 10 6.7v2.8H7v4h3V22h4v-8.5Z" />
        </svg>
      )}
      {key === 'messenger' && (
        <svg viewBox="0 0 24 24" className="w-4/6 h-4/6 fill-current" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.15 2 11.27c0 2.92 1.45 5.52 3.72 7.22V22l3.42-1.88c.91.25 1.87.39 2.86.39 5.52 0 10-4.15 10-9.27C22 6.15 17.52 2 12 2Zm1 12.48-2.55-2.72-4.97 2.72 5.47-5.8 2.61 2.72 4.91-2.72-5.47 5.8Z" />
        </svg>
      )}
      {key === 'x' && (
        <svg viewBox="0 0 24 24" className="w-4/6 h-4/6 fill-current" aria-hidden="true">
          <path d="M18.24 2.25h3.3l-7.22 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
        </svg>
      )}
      {key === 'youtube' && (
        <svg viewBox="0 0 24 24" className="w-4/6 h-4/6 fill-current" aria-hidden="true">
          <path d="M21.58 7.19a2.75 2.75 0 0 0-1.94-1.94C17.93 4.75 12 4.75 12 4.75s-5.93 0-7.64.5A2.75 2.75 0 0 0 2.42 7.2C1.92 8.9 1.92 12 1.92 12s0 3.1.5 4.81a2.75 2.75 0 0 0 1.94 1.94c1.71.5 7.64.5 7.64.5s5.93 0 7.64-.5a2.75 2.75 0 0 0 1.94-1.94c.5-1.71.5-4.81.5-4.81s0-3.1-.5-4.81ZM9.75 15.02V8.98L15.25 12l-5.5 3.02Z" />
        </svg>
      )}
      {!['whatsapp', 'telegram', 'instagram', 'facebook', 'messenger', 'x', 'youtube'].includes(key) && (
        <span>{meta.glyph}</span>
      )}
    </div>
  );
}
