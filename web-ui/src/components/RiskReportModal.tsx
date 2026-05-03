import React from 'react';

interface RiskEvent {
  type: string;
  description: string;
  probability: number;
  impact: 'fatal' | 'disruptive';
  details?: string;
}

interface TurnRisk {
  turnNumber: number;
  risks: RiskEvent[];
  turnSuccessProbability: number;
}

interface RiskSummaryStats {
  totalCritsDodged: number;
  totalSecondaryEffectsDodged: number;
  totalAccuracyChecksPassed: number;
  totalFullParaChecksPassed: number;
}

interface RiskReport {
  turns: TurnRisk[];
  overallSuccessProbability: number;
  overallFailureProbability: number;
  summaryStats: RiskSummaryStats;
  summary: string;
}

type Props = {
  report: RiskReport;
  onClose: () => void;
};

function getSuccessColor(pct: number): string {
  if (pct >= 90) return 'text-green-400';
  if (pct >= 70) return 'text-yellow-400';
  return 'text-red-400';
}

function getSuccessBg(pct: number): string {
  if (pct >= 90) return 'bg-green-900/30 border-green-700';
  if (pct >= 70) return 'bg-yellow-900/30 border-yellow-700';
  return 'bg-red-900/30 border-red-700';
}

function getImpactBadge(impact: 'fatal' | 'disruptive') {
  if (impact === 'fatal') {
    return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-900/50 text-red-300 uppercase">fatal</span>;
  }
  return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-yellow-900/50 text-yellow-300 uppercase">disruptive</span>;
}

function formatPct(prob: number): string {
  return (prob * 100).toFixed(1) + '%';
}

export default function RiskReportModal({ report, onClose }: Props) {
  const successPct = report.overallSuccessProbability * 100;
  const failPct = report.overallFailureProbability * 100;
  const turnsWithRisks = report.turns.filter(t => t.risks.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="text-lg font-bold text-neutral-100">Risk Analysis Report</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Overall probability */}
          <div className={`rounded-xl border p-4 ${getSuccessBg(successPct)}`}>
            <div className="flex items-baseline gap-3">
              <span className={`text-3xl font-black ${getSuccessColor(successPct)}`}>
                {successPct.toFixed(1)}%
              </span>
              <span className="text-neutral-300 text-sm">chance this line succeeds</span>
            </div>
            <div className="mt-1 text-neutral-400 text-xs">
              {failPct.toFixed(1)}% chance something goes wrong
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Crits dodged" value={report.summaryStats.totalCritsDodged} />
            <StatBox label="Secondary effects dodged" value={report.summaryStats.totalSecondaryEffectsDodged} />
            <StatBox label="Accuracy checks passed" value={report.summaryStats.totalAccuracyChecksPassed} />
            <StatBox label="Full-para checks passed" value={report.summaryStats.totalFullParaChecksPassed} />
          </div>

          {/* Per-turn breakdown */}
          {turnsWithRisks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">Per-Turn Breakdown</h3>
              {turnsWithRisks.map((turn) => (
                <TurnRiskRow key={turn.turnNumber} turn={turn} />
              ))}
            </div>
          )}

          {turnsWithRisks.length === 0 && (
            <div className="text-center py-6 text-neutral-500 text-sm">
              No RNG risks detected in this line. 100% deterministic!
            </div>
          )}

          {/* Summary text */}
          <div className="border-t border-neutral-800 pt-3">
            <p className="text-xs text-neutral-400 leading-relaxed">{report.summary}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-sm font-medium transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-neutral-800/60 border border-neutral-700 px-3 py-2">
      <div className="text-xl font-bold text-neutral-100">{value}</div>
      <div className="text-[11px] text-neutral-400">{label}</div>
    </div>
  );
}

function TurnRiskRow({ turn }: { turn: TurnRisk }) {
  const turnPct = turn.turnSuccessProbability * 100;
  return (
    <div className="rounded-lg bg-neutral-800/40 border border-neutral-700/50 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-neutral-300">Turn {turn.turnNumber}</span>
        <span className={`text-xs font-medium ${getSuccessColor(turnPct)}`}>
          {turnPct.toFixed(1)}% safe
        </span>
      </div>
      <div className="space-y-1">
        {turn.risks.map((risk, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            {getImpactBadge(risk.impact)}
            <span className="text-neutral-300 flex-1">{risk.description}</span>
            <span className="text-neutral-400 shrink-0 font-mono">{formatPct(risk.probability)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
