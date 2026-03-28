'use client';

import { memo, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel from '@/components/GlassPanel';
import { MetricCard, SectionLabel } from '@/components/ui';
import { useAppStore, ShipmentPayload, ShipmentStop } from '@/lib/store';
import { Trash2 } from 'lucide-react';

/* ═══════════════════════════════════════════════════════
   STABLE INPUT COMPONENTS (outside the parent component)
   ═══════════════════════════════════════════════════════ */

const inputClass =
  'w-full px-4 py-3 rounded-lg border border-white/[0.06] bg-white/[0.02] text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-neon-blue/30 focus:bg-neon-blue/[0.02] transition-colors';

const labelClass = 'block text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-2';

/* ── TextInput ── */
const TextInput = memo(function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
});

/* ── SelectInput ── */
const SelectInput = memo(function SelectInput({
  label,
  value,
  options,
  onSelect,
  full,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className={labelClass}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(opt)}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
              value === opt
                ? 'border-neon-blue/30 bg-neon-blue/8 text-neon-blue'
                : 'border-white/5 bg-white/[0.02] text-text-muted hover:text-text-secondary hover:border-white/10'
            }`}
          >
            {opt.charAt(0).toUpperCase() + opt.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
});

/* ── StopInput (individual stop row, own identity) ── */
const StopInput = memo(function StopInput({
  stop,
  index,
  onUpdate,
  onRemove,
}: {
  stop: ShipmentStop;
  index: number;
  onUpdate: (id: string, location: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-mono text-text-muted w-14 flex-shrink-0">Stop {index + 1}</span>
      <input
        value={stop.location}
        onChange={(e) => onUpdate(stop.id, e.target.value)}
        placeholder="e.g. Singapore"
        className={`flex-1 ${inputClass}`}
      />
      <button
        type="button"
        onClick={() => onRemove(stop.id)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-risk-high hover:bg-risk-high/5 text-xs cursor-pointer transition-all flex-shrink-0"
      >
        ✕
      </button>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */
interface RecentShipment {
  id: string;           // MongoDB _id (or mock-* for fallback)
  displayId: string;    // e.g. SH-4821
  route: string;
  status: string;
  mode: string;
  eta: string;
  cargo: string;
}

interface DashboardData {
  operations: { totalShipments: number; activeDeliveries: number; completedDeliveries: number };
  trade: { importsVolume: string; exportsVolume: string };
  performance: { onTimeRate: number; avgDelayReduction: string; costOptimization: number };
  risk: { riskIndex: number; activeDisruptions: number };
  extra: { revenueHandled: string; aiConfidence: number };
  recentShipments: RecentShipment[];
  activeAlerts: { id: number; severity: string; title: string; time: string }[];
}

/* ═══════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════ */
const defaultForm: ShipmentPayload = {
  source: '',
  destination: '',
  stops: [],
  shipmentType: '',
  quantity: '',
  transportMode: '',
  deadline: '',
  budget: '',
  priority: 'medium',
  riskTolerance: 'medium',
  distributionStrategy: 'full',
  warehouseConstraints: '',
  supplierPreferences: '',
  restrictedRegions: '',
  complianceRequirements: '',
  timeWindows: '',
  ecoRouting: false,
  insurance: false,
};

const SHIPMENT_TYPES = ['Raw Materials', 'Electronics', 'FMCG', 'Pharma', 'Perishable'];
const TRANSPORT_MODES = ['Road', 'Sea', 'Air', 'Multi-modal'];
const PRIORITIES: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */
const statusColor = (s: string) => {
  if (s === 'DELIVERED') return 'text-risk-low';
  if (s === 'DELAYED') return 'text-risk-high';
  if (s === 'AT_PORT') return 'text-risk-medium';
  return 'text-neon-blue';
};

const alertDot = (s: string) => {
  if (s === 'critical') return 'bg-risk-high shadow-[0_0_6px_rgba(239,68,68,0.5)]';
  if (s === 'warning') return 'bg-risk-medium shadow-[0_0_6px_rgba(245,158,11,0.5)]';
  return 'bg-neon-blue shadow-[0_0_6px_rgba(59,130,246,0.5)]';
};

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */
export default function HomePage() {
  const router = useRouter();
  const setShipment    = useAppStore((s) => s.setShipment);
  const setShipmentDbId = useAppStore((s) => s.setShipmentDbId);
  const [data, setData] = useState<DashboardData | null>(null);
  const [form, setForm] = useState<ShipmentPayload>({ ...defaultForm });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<'dashboard' | 'create'>('dashboard');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/home-data').then((r) => r.json()).then(setData);
  }, []);

  /* ── Stable field updaters (useCallback with no deps → stable references) ── */
  const updateField = useCallback(<K extends keyof ShipmentPayload>(key: K, val: ShipmentPayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  const addStop = useCallback(() => {
    const newStop: ShipmentStop = { id: `stop-${Date.now()}`, location: '' };
    setForm((prev) => ({ ...prev, stops: [...prev.stops, newStop] }));
  }, []);

  const removeStop = useCallback((id: string) => {
    setForm((prev) => ({ ...prev, stops: prev.stops.filter((s) => s.id !== id) }));
  }, []);

  const updateStop = useCallback((id: string, location: string) => {
    setForm((prev) => ({
      ...prev,
      stops: prev.stops.map((s) => (s.id === id ? { ...s, location } : s)),
    }));
  }, []);

  /* ── Stable onChange callbacks (one per field, memoized) ── */
  const onSourceChange = useCallback((v: string) => updateField('source', v), [updateField]);
  const onDestinationChange = useCallback((v: string) => updateField('destination', v), [updateField]);
  const onQuantityChange = useCallback((v: string) => updateField('quantity', v), [updateField]);
  const onDeadlineChange = useCallback((v: string) => updateField('deadline', v), [updateField]);
  const onBudgetChange = useCallback((v: string) => updateField('budget', v), [updateField]);
  const onWarehouseChange = useCallback((v: string) => updateField('warehouseConstraints', v), [updateField]);
  const onSupplierChange = useCallback((v: string) => updateField('supplierPreferences', v), [updateField]);
  const onRestrictedChange = useCallback((v: string) => updateField('restrictedRegions', v), [updateField]);
  const onComplianceChange = useCallback((v: string) => updateField('complianceRequirements', v), [updateField]);
  const onTimeWindowsChange = useCallback((v: string) => updateField('timeWindows', v), [updateField]);

  const onShipmentTypeSelect = useCallback((v: string) => updateField('shipmentType', v), [updateField]);
  const onTransportModeSelect = useCallback((v: string) => updateField('transportMode', v), [updateField]);
  const onPrioritySelect = useCallback((v: string) => updateField('priority', v as 'low' | 'medium' | 'high'), [updateField]);
  const onRiskSelect = useCallback((v: string) => updateField('riskTolerance', v as 'low' | 'medium' | 'high'), [updateField]);
  const onDistributionSelect = useCallback((v: string) => updateField('distributionStrategy', v), [updateField]);

  /* ── Delete shipment ── */
  const handleDelete = useCallback(async (id: string) => {
    if (!id) return;
    setDeletingId(id);
    try {
      await fetch(`/api/shipments/${id}`, { method: 'DELETE' });
      setData((prev) =>
        prev
          ? { ...prev, recentShipments: prev.recentShipments.filter((s) => s.id !== id) }
          : prev,
      );
    } finally {
      setDeletingId(null);
    }
  }, []);

  /* ── Submit ── */
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setErrors([]);
    try {
      const res = await fetch('/api/shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (!result.success) {
        setErrors(result.errors);
        setSubmitting(false);
        return;
      }
      setShipment(form);
      if (result.dbId) setShipmentDbId(result.dbId);
      router.push('/map');
    } catch {
      setErrors(['Failed to submit. Please try again.']);
      setSubmitting(false);
    }
  }, [form, setShipment, setShipmentDbId, router]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14 pb-14">
        <div className="text-text-muted text-sm font-mono animate-pulse">Loading command center...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-16 pb-20 px-6">
      <div className="max-w-7xl mx-auto">

        {/* ════════════════════ SECTION 1: HEADER ════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <SectionLabel>Command Center</SectionLabel>
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-text-primary">Supply Chain Command Center</h1>
          <p className="text-text-secondary text-sm mt-1">Manage, optimize, and distribute goods globally with AI</p>

          {/* Tab switcher */}
          <div className="flex gap-2 mt-6">
            {(['dashboard', 'create'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveSection(tab)}
                className={`px-5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all cursor-pointer ${
                  activeSection === tab
                    ? 'border-neon-blue/30 bg-neon-blue/8 text-neon-blue'
                    : 'border-white/5 text-text-muted hover:text-text-secondary hover:border-white/10'
                }`}
              >
                {tab === 'dashboard' ? '📊 Operations Dashboard' : '📦 Create Shipment'}
              </button>
            ))}
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {activeSection === 'dashboard' ? (
            /* ════════════════════ DASHBOARD VIEW ════════════════════ */
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* ── SECTION 2: GLOBAL BUSINESS DASHBOARD ── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <MetricCard label="Total Shipments" value={data.operations.totalShipments.toLocaleString()} color="text-neon-cyan" />
                <MetricCard label="Active Deliveries" value={data.operations.activeDeliveries.toLocaleString()} color="text-neon-blue" />
                <MetricCard label="Completed" value={data.operations.completedDeliveries.toLocaleString()} color="text-risk-low" />
                <MetricCard label="Imports Volume" value={data.trade.importsVolume} color="text-neon-purple" />
                <MetricCard label="Exports Volume" value={data.trade.exportsVolume} color="text-neon-purple" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricCard label="On-Time Rate" value={`${data.performance.onTimeRate}%`} color="text-risk-low" />
                <MetricCard label="Delay Reduction" value={data.performance.avgDelayReduction} color="text-neon-blue" />
                <MetricCard label="Cost Savings" value={`${data.performance.costOptimization}%`} color="text-neon-cyan" />
                <MetricCard label="Risk Index" value={`${data.risk.riskIndex}/100`} color={data.risk.riskIndex > 50 ? 'text-risk-high' : 'text-risk-low'} />
                <MetricCard label="Disruptions" value={String(data.risk.activeDisruptions)} color="text-risk-medium" />
                <MetricCard label="AI Confidence" value={`${data.extra.aiConfidence}%`} color="text-risk-low" />
              </div>

              {/* Revenue banner */}
              <GlassPanel className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-text-muted">Revenue Handled</div>
                  <div className="font-heading text-2xl font-bold text-neon-cyan">{data.extra.revenueHandled}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse" />
                  <span className="text-[10px] font-mono text-text-muted">LIVE FEED</span>
                </div>
              </GlassPanel>

              {/* ── SECTION 3: LIVE OPERATIONS SNAPSHOT ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <GlassPanel className="p-5">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-4">Recent Shipments</div>
                    <div className="space-y-2">
                      {data.recentShipments.map((s) => (
                        <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.02] transition-colors group">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-[10px] text-text-muted w-16 flex-shrink-0">{s.displayId ?? s.id}</span>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-text-primary truncate">{s.route}</div>
                              <div className="text-[10px] text-text-muted">{s.cargo} • {s.mode}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              <div className={`text-[10px] font-bold tracking-wider uppercase ${statusColor(s.status)}`}>{s.status.replace('_', ' ')}</div>
                              <div className="text-[10px] text-text-muted font-mono">ETA {s.eta}</div>
                            </div>
                            <button
                              onClick={() => handleDelete(s.id)}
                              disabled={deletingId === s.id}
                              title="Delete shipment"
                              className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-risk-high hover:bg-risk-high/10 transition-all cursor-pointer disabled:opacity-30"
                            >
                              {deletingId === s.id
                                ? <span className="w-3 h-3 border border-risk-high/40 border-t-risk-high rounded-full animate-spin" />
                                : <Trash2 size={12} />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassPanel>
                </div>

                <GlassPanel className="p-5">
                  <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-4">Active Alerts</div>
                  <div className="space-y-3">
                    {data.activeAlerts.map((a) => (
                      <div key={a.id} className="flex items-start gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${alertDot(a.severity)}`} />
                        <div>
                          <div className="text-xs font-medium text-text-primary">{a.title}</div>
                          <div className="text-[10px] text-text-muted">{a.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 pt-4 border-t border-white/5">
                    <button
                      onClick={() => setActiveSection('create')}
                      className="w-full py-3 rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 text-neon-cyan text-xs font-semibold uppercase tracking-wider cursor-pointer hover:bg-neon-cyan/10 hover:border-neon-cyan/30 transition-all"
                    >
                      + Create New Shipment
                    </button>
                  </div>
                </GlassPanel>
              </div>
            </motion.div>
          ) : (
            /* ════════════════════ CREATE SHIPMENT VIEW ════════════════════ */
            <motion.div
              key="create"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              {/* ── A. ORIGIN & DESTINATION ── */}
              <GlassPanel className="p-6">
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-5">A. Origin & Destination</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <TextInput label="Source Location" value={form.source} onChange={onSourceChange} placeholder="e.g. Mumbai" />
                  <TextInput label="Destination" value={form.destination} onChange={onDestinationChange} placeholder="e.g. Dubai" />
                </div>
              </GlassPanel>

              {/* ── B. MULTI-STOP DISTRIBUTION ── */}
              <GlassPanel className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">B. Multi-Stop Distribution</div>
                  <button
                    type="button"
                    onClick={addStop}
                    className="px-4 py-2 rounded-lg border border-neon-blue/20 bg-neon-blue/5 text-neon-blue text-[10px] font-semibold uppercase tracking-wider cursor-pointer hover:bg-neon-blue/10 transition-all"
                  >
                    + Add Stop
                  </button>
                </div>
                {form.stops.length === 0 ? (
                  <p className="text-xs text-text-muted">No intermediate stops added. Click &quot;+ Add Stop&quot; for multi-point distribution.</p>
                ) : (
                  <div className="space-y-3">
                    {form.stops.map((stop, i) => (
                      <StopInput
                        key={stop.id}
                        stop={stop}
                        index={i}
                        onUpdate={updateStop}
                        onRemove={removeStop}
                      />
                    ))}
                  </div>
                )}
              </GlassPanel>

              {/* ── C. SHIPMENT DETAILS ── */}
              <GlassPanel className="p-6">
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-5">C. Shipment Details</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <SelectInput label="Shipment Type" value={form.shipmentType} options={SHIPMENT_TYPES} onSelect={onShipmentTypeSelect} full />
                  <TextInput label="Quantity / Volume" value={form.quantity} onChange={onQuantityChange} placeholder="e.g. 2,400 TEU or 45,000 kg" />
                  <SelectInput label="Transport Mode" value={form.transportMode} options={TRANSPORT_MODES} onSelect={onTransportModeSelect} />
                </div>
              </GlassPanel>

              {/* ── D. CONSTRAINTS ── */}
              <GlassPanel className="p-6">
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-5">D. Constraints</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <TextInput label="Delivery Deadline" value={form.deadline} onChange={onDeadlineChange} type="date" />
                  <TextInput label="Budget Constraint ($)" value={form.budget} onChange={onBudgetChange} placeholder="e.g. 500,000" />
                  <SelectInput label="Priority Level" value={form.priority} options={PRIORITIES} onSelect={onPrioritySelect} />
                  <SelectInput label="Risk Tolerance" value={form.riskTolerance} options={PRIORITIES} onSelect={onRiskSelect} />
                </div>
              </GlassPanel>

              {/* ── E. DISTRIBUTION & LOGISTICS ── */}
              <GlassPanel className="p-6">
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-5">E. Distribution & Logistics</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <SelectInput label="Distribution Strategy" value={form.distributionStrategy} options={['full', 'partial']} onSelect={onDistributionSelect} />
                  <TextInput label="Warehouse Constraints" value={form.warehouseConstraints} onChange={onWarehouseChange} placeholder="Preferred warehouse locations" />
                  <TextInput label="Supplier Preferences" value={form.supplierPreferences} onChange={onSupplierChange} placeholder="Preferred or restricted suppliers" />
                </div>
              </GlassPanel>

              {/* ── F. REGULATORY & ADVANCED ── */}
              <GlassPanel className="p-6">
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-5">F. Regulatory & Advanced</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <TextInput label="Restricted Regions" value={form.restrictedRegions} onChange={onRestrictedChange} placeholder="Regions to avoid" />
                  <TextInput label="Compliance Requirements" value={form.complianceRequirements} onChange={onComplianceChange} placeholder="e.g. GDPR, hazardous materials" />
                  <TextInput label="Time Windows" value={form.timeWindows} onChange={onTimeWindowsChange} placeholder="Delivery time restrictions" />
                  <div className="flex items-center gap-6 pt-6">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={form.ecoRouting}
                        onChange={(e) => updateField('ecoRouting', e.target.checked)}
                        className="accent-neon-blue w-4 h-4"
                      />
                      <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">🌿 Eco Routing</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={form.insurance}
                        onChange={(e) => updateField('insurance', e.target.checked)}
                        className="accent-neon-blue w-4 h-4"
                      />
                      <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">🛡️ Insurance</span>
                    </label>
                  </div>
                </div>
              </GlassPanel>

              {/* ── Errors ── */}
              {errors.length > 0 && (
                <div className="px-4 py-3 rounded-lg border border-risk-high/20 bg-risk-high/5">
                  {errors.map((e, i) => (
                    <div key={i} className="text-xs text-risk-high">• {e}</div>
                  ))}
                </div>
              )}

              {/* ── SUBMIT ── */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`w-full py-4 rounded-xl font-heading text-sm font-semibold tracking-[0.2em] uppercase transition-all cursor-pointer ${
                  submitting
                    ? 'bg-white/[0.02] border border-white/5 text-text-muted cursor-wait'
                    : 'bg-neon-cyan/8 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/15 hover:border-neon-cyan/50 hover:shadow-[0_0_40px_rgba(0,240,255,0.15)]'
                }`}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3 h-3 border border-neon-cyan/40 border-t-neon-cyan rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  '🚀 Plan & Optimize Supply Chain'
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
