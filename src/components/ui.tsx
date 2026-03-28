'use client';

export function StatusBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const config = {
    low: { bg: 'bg-risk-low/10', text: 'text-risk-low', label: 'LOW' },
    medium: { bg: 'bg-risk-medium/10', text: 'text-risk-medium', label: 'MEDIUM' },
    high: { bg: 'bg-risk-high/10', text: 'text-risk-high', label: 'HIGH' },
  };
  const c = config[level];
  return (
    <span className={`${c.bg} ${c.text} px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase`}>
      {c.label}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  color = 'text-neon-cyan',
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="glass p-4 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-text-muted font-medium">{label}</span>
      <span className={`font-heading text-2xl font-bold ${color}`}>{value}</span>
      {sub && <span className="text-xs text-text-secondary">{sub}</span>}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-3 py-1 rounded-full border border-neon-blue/15 bg-neon-blue/5 text-[10px] font-semibold tracking-[0.15em] uppercase text-neon-blue mb-3">
      {children}
    </span>
  );
}
