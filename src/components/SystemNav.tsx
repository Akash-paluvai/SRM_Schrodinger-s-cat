'use client';

import { usePathname, useRouter } from 'next/navigation';

const systemRoutes = ['/home', '/map', '/intelligence', '/simulation', '/explainability', '/graph'];
const routeLabels: Record<string, string> = {
  '/home': 'Command Center',
  '/map': 'Global Map',
  '/intelligence': 'Intelligence',
  '/simulation': 'Simulation',
  '/explainability': 'Explainability',
  '/graph': 'Graph',
};

export default function SystemNav() {
  const pathname = usePathname();
  const router = useRouter();

  // Hide nav on landing page
  if (pathname === '/') return null;

  const currentIndex = systemRoutes.indexOf(pathname);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < systemRoutes.length - 1 && currentIndex >= 0;

  return (
    <>
      {/* Top Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-[#0B0F1A]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <div className="w-2 h-2 rounded-full bg-neon-cyan shadow-[0_0_8px_rgba(0,240,255,0.6)]" />
          <span className="font-heading font-bold text-sm text-text-primary">ChainMind</span>
          <span className="font-heading font-bold text-sm text-gradient">AI+</span>
        </button>

        <div className="flex gap-1">
          {systemRoutes.map((route) => (
            <button
              key={route}
              onClick={() => router.push(route)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                pathname === route
                  ? 'bg-neon-blue/10 text-neon-blue'
                  : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.03]'
              }`}
            >
              {routeLabels[route]}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono text-text-muted flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse" />
          SYSTEM ONLINE
        </div>
      </nav>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-[#0B0F1A]/90 backdrop-blur-xl border-t border-white/[0.06]">
        <button
          onClick={() => hasPrev && router.push(systemRoutes[currentIndex - 1])}
          disabled={!hasPrev}
          className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
            hasPrev
              ? 'border-neon-blue/20 text-neon-blue hover:border-neon-blue/40 hover:bg-neon-blue/5'
              : 'border-white/5 text-text-muted/30 cursor-not-allowed'
          }`}
        >
          ← Prev
        </button>

        <div className="flex gap-2">
          {systemRoutes.map((route, i) => (
            <div
              key={route}
              onClick={() => router.push(route)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                i === currentIndex ? 'w-6 bg-neon-blue' : 'w-1.5 bg-white/10 hover:bg-white/20'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => hasNext && router.push(systemRoutes[currentIndex + 1])}
          disabled={!hasNext}
          className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
            hasNext
              ? 'border-neon-blue/20 text-neon-blue hover:border-neon-blue/40 hover:bg-neon-blue/5'
              : 'border-white/5 text-text-muted/30 cursor-not-allowed'
          }`}
        >
          Next →
        </button>
      </div>
    </>
  );
}
