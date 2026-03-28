'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { Brain, Network, Cpu, ShieldAlert } from 'lucide-react';

const GlobeSection = dynamic(() => import('@/components/GlobeSection'), { ssr: false });

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen flex flex-col items-center overflow-x-hidden pt-32 pb-20 relative px-6 md:px-10">
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-neon-blue/[0.04] blur-[120px] pointer-events-none rounded-full" />

      {/* 1. HERO SECTION (Lander) */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center text-center max-w-5xl mx-auto w-full mt-10"
      >
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-risk-low/20 bg-risk-low/5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse" />
          <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-risk-low">System Online</span>
        </div>

        <h1 className="font-heading text-5xl md:text-7xl lg:text-[5rem] leading-[1.1] font-bold text-text-primary tracking-tight mb-8">
          AI Command Center for <br className="hidden md:block" />
          <span className="text-gradient">Global Supply Chains</span>
        </h1>

        <p className="text-lg md:text-xl text-text-secondary mb-12 max-w-2xl mx-auto leading-relaxed">
          Predict disruptions. Simulate ripple effects. Reroute logistics in real time.
        </p>

        <button
          onClick={() => router.push('/home')}
          className="group relative px-10 py-5 rounded-xl border border-neon-blue/30 bg-neon-blue/[0.08] text-neon-blue font-heading font-semibold text-sm tracking-[0.2em] uppercase cursor-pointer transition-all hover:border-neon-blue/60 hover:bg-neon-blue/15 hover:shadow-[0_0_40px_rgba(59,130,246,0.25)]"
        >
          View Global Map
          <div className="absolute inset-0 rounded-xl bg-neon-blue/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </motion.div>

      {/* 2. GLOBE AND CONTENT ROW */}
      <div className="w-full max-w-[1300px] mx-auto mt-24 relative z-10">
        <div className="flex flex-col lg:flex-row gap-6 items-stretch w-full">
          
          {/* GLOBE (Left Side) */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            className="w-full lg:w-[55%] flex min-h-[500px] lg:min-h-0 rounded-3xl overflow-hidden glass border-white/[0.04] bg-[#0B0F1A]/40 relative"
          >
            <div className="absolute inset-0 pointer-events-none rounded-3xl shadow-[inset_0_0_150px_rgba(11,15,26,1)] z-10" />
            <GlobeSection />
          </motion.div>

          {/* CONTENT (Right Side) */}
          <div className="w-full lg:w-[45%] flex flex-col gap-6">
            
            {/* STATS */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="grid grid-cols-2 gap-4"
            >
              {[
                { value: "80%", label: "of companies faced disruptions" },
                { value: "$2.3T", label: "global logistics market" },
                { value: "94%", label: "lack full visibility" },
                { value: "Up to 18%", label: "cost reduction" }
              ].map((stat, i) => (
                <div key={i} className="glass p-5 rounded-2xl flex flex-col items-center justify-center text-center hover:-translate-y-0.5 transition-transform duration-300 border-white/[0.04] bg-white/[0.01]">
                  <div className="font-heading text-[2rem] leading-none font-bold text-gradient mb-2">{stat.value}</div>
                  <div className="text-[9px] sm:text-[10px] font-semibold tracking-[0.15em] text-text-muted uppercase leading-tight">{stat.label}</div>
                </div>
              ))}
            </motion.div>

            {/* FEATURES */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="flex flex-col gap-4 h-full"
            >
              {[
                { icon: Brain, title: "Predictive Intelligence", desc: "Anticipate disruptions before they happen using AI." },
                { icon: Network, title: "Simulation Engine", desc: "Model scenarios and ripple effects across your network." },
                { icon: Cpu, title: "Autonomous Decisions", desc: "Automate rerouting and planning with sub-second latency." },
                { icon: ShieldAlert, title: "Risk Monitoring", desc: "Continuous 24/7 surveillance of global events." }
              ].map((feat, i) => {
                const Icon = feat.icon;
                return (
                  <div key={i} className="glass flex-1 p-5 rounded-2xl flex flex-row items-center gap-5 hover:translate-x-1 hover:bg-white/[0.03] transition-all duration-300 group cursor-default border-white/[0.04] bg-white/[0.01]">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-neon-blue/5 flex items-center justify-center border border-white/[0.04] group-hover:bg-neon-blue/10 group-hover:border-neon-blue/20 transition-all">
                      <Icon className="w-5 h-5 text-neon-blue group-hover:text-neon-cyan transition-colors" />
                    </div>
                    <div className="flex flex-col flex-1 justify-center">
                      <h3 className="font-heading text-base font-bold text-text-primary mb-1">{feat.title}</h3>
                      <p className="text-text-secondary text-xs leading-relaxed">{feat.desc}</p>
                    </div>
                  </div>
                );
              })}
            </motion.div>

          </div>
        </div>
      </div>

      {/* 3. FINAL CTA SECTION */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
        className="text-center pt-32 px-6 max-w-3xl mx-auto w-full z-10"
      >
        <h2 className="font-heading text-4xl md:text-5xl font-bold text-text-primary mb-12 tracking-tight">
          Stop reacting.<br className="md:hidden" /> <span className="text-gradient">Start predicting.</span>
        </h2>
        <button
          onClick={() => router.push('/home')}
          className="group relative px-10 py-5 rounded-xl border border-neon-cyan/30 bg-neon-cyan/[0.08] text-neon-cyan font-heading font-semibold text-sm tracking-[0.2em] uppercase cursor-pointer transition-all hover:border-neon-cyan/60 hover:bg-neon-cyan/15 hover:shadow-[0_0_40px_rgba(0,240,255,0.25)]"
        >
          Open Global Map →
          <div className="absolute inset-0 rounded-xl bg-neon-cyan/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </motion.div>

    </main>
  );
}
