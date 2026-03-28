'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-neon-blue/[0.04] blur-[100px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-neon-purple/[0.03] blur-[80px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center text-center max-w-xl px-6"
      >
        {/* Status badge */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-risk-low/20 bg-risk-low/5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse" />
          <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-risk-low">System Operational</span>
        </div>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-3 h-3 rounded-full bg-neon-cyan shadow-[0_0_12px_rgba(0,240,255,0.6)]" />
          <h1 className="font-heading text-5xl font-bold text-text-primary tracking-tight">
            ChainMind <span className="text-gradient">AI+</span>
          </h1>
        </div>

        {/* Subtitle */}
        <p className="text-lg text-text-secondary mb-10 leading-relaxed">
          AI Command Center for Global Supply Chains
        </p>

        {/* Enter Button */}
        <button
          onClick={() => router.push('/map')}
          className="group relative px-10 py-4 rounded-xl border border-neon-blue/30 bg-neon-blue/[0.08] text-neon-blue font-heading font-semibold text-sm tracking-wider uppercase cursor-pointer transition-all hover:border-neon-blue/60 hover:bg-neon-blue/15 hover:shadow-[0_0_40px_rgba(59,130,246,0.2)]"
        >
          Enter System →
          <div className="absolute inset-0 rounded-xl bg-neon-blue/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        {/* Mini stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="flex gap-8 mt-14 text-center"
        >
          <div>
            <div className="font-heading text-xl font-bold text-neon-cyan">847</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted mt-0.5">Active Routes</div>
          </div>
          <div className="w-px bg-white/5" />
          <div>
            <div className="font-heading text-xl font-bold text-neon-blue">12.4K</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted mt-0.5">Shipments</div>
          </div>
          <div className="w-px bg-white/5" />
          <div>
            <div className="font-heading text-xl font-bold text-risk-low">99.2%</div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted mt-0.5">On-Time</div>
          </div>
        </motion.div>
      </motion.div>
    </main>
  );
}
