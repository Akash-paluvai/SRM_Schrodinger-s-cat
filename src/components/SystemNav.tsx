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

  if (pathname === '/') return null;

  const currentIndex = systemRoutes.indexOf(pathname);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < systemRoutes.length - 1 && currentIndex >= 0;

  return (
    <>
      <div className="fixed top-4 left-1/2 z-50 w-[calc(100%-1.25rem)] max-w-7xl -translate-x-1/2 sm:w-[calc(100%-2rem)]">
        <nav className="liquid-glass rounded-[1.75rem] px-3 py-3 sm:px-4">
          <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <button
              onClick={() => router.push('/')}
              className="liquid-glass-pill flex items-center gap-2 self-start rounded-full px-4 py-2 cursor-pointer transition-transform duration-300 hover:scale-[1.01]"
            >
              <div className="h-2.5 w-2.5 rounded-full bg-neon-cyan shadow-[0_0_12px_rgba(0,240,255,0.8)]" />
              <span className="font-heading text-sm font-semibold tracking-[0.2em] text-text-primary uppercase">
                ChainMind
              </span>
              <span className="font-heading text-sm font-bold text-gradient">AI+</span>
            </button>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {systemRoutes.map((route) => (
                <button
                  key={route}
                  onClick={() => router.push(route)}
                  className={`rounded-full px-4 py-2 text-[11px] font-medium tracking-[0.18em] uppercase transition-all duration-300 cursor-pointer ${
                    pathname === route
                      ? 'liquid-glass-pill text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_12px_30px_rgba(59,130,246,0.2)]'
                      : 'bg-white/[0.04] text-text-secondary hover:bg-white/[0.08] hover:text-text-primary'
                  }`}
                >
                  {routeLabels[route]}
                </button>
              ))}
            </div>

            <div className="liquid-glass-pill flex items-center gap-2 self-end rounded-full px-4 py-2 text-[11px] font-mono tracking-[0.24em] text-text-secondary uppercase lg:self-auto">
              <span className="h-2 w-2 rounded-full bg-risk-low shadow-[0_0_12px_rgba(16,185,129,0.75)] animate-pulse" />
              System Online
            </div>
          </div>
        </nav>
      </div>

      <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-1.25rem)] max-w-xl -translate-x-1/2 sm:w-[calc(100%-2rem)]">
        <div className="liquid-glass rounded-[1.75rem] px-3 py-3">
          <div className="relative z-10 flex items-center justify-between gap-3">
            <button
              onClick={() => hasPrev && router.push(systemRoutes[currentIndex - 1])}
              disabled={!hasPrev}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-all duration-300 ${
                hasPrev
                  ? 'liquid-glass-pill text-text-primary cursor-pointer hover:-translate-y-0.5'
                  : 'border border-white/[0.05] bg-white/[0.03] text-text-muted/40 cursor-not-allowed'
              }`}
            >
              Prev
            </button>

            <div className="liquid-glass-pill flex items-center gap-2 rounded-full px-3 py-2">
              {systemRoutes.map((route, i) => (
                <button
                  key={route}
                  onClick={() => router.push(route)}
                  aria-label={`Go to ${routeLabels[route]}`}
                  className={`rounded-full transition-all duration-300 cursor-pointer ${
                    i === currentIndex
                      ? 'h-2.5 w-8 bg-white shadow-[0_0_18px_rgba(255,255,255,0.45)]'
                      : 'h-2.5 w-2.5 bg-white/20 hover:bg-white/35'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={() => hasNext && router.push(systemRoutes[currentIndex + 1])}
              disabled={!hasNext}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-all duration-300 ${
                hasNext
                  ? 'liquid-glass-pill text-text-primary cursor-pointer hover:-translate-y-0.5'
                  : 'border border-white/[0.05] bg-white/[0.03] text-text-muted/40 cursor-not-allowed'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
