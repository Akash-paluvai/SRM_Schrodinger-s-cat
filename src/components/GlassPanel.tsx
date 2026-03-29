import { CSSProperties, ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export default function GlassPanel({ children, className = '', style }: GlassPanelProps) {
  return (
    <div className={`glass p-5 ${className}`} style={style}>
      {children}
    </div>
  );
}
