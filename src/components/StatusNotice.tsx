import type { ReactNode } from 'react';

interface StatusNoticeProps {
  tone?: 'default' | 'warning';
  children: ReactNode;
}

export function StatusNotice({ tone = 'default', children }: StatusNoticeProps) {
  const toneClass =
    tone === 'warning'
      ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
      : 'bg-[var(--surface-secondary)] border-[var(--border-secondary)] text-[var(--text-primary)]';

  return (
    <div className={`fixed bottom-4 right-4 z-50 rounded-xl shadow-lg border p-4 max-w-sm ${toneClass}`}>
      {children}
    </div>
  );
}
