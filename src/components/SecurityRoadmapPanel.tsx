import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Lock, ShieldCheck } from 'lucide-react';
import { SECURITY_ROADMAP_PHASES } from '../utils/adminAuthSecurity';

interface SecurityRoadmapPanelProps {
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  compact?: boolean;
}

export const SecurityRoadmapPanel: React.FC<SecurityRoadmapPanelProps> = ({
  theme = 'dark',
  compact = false,
}) => {
  const isLight = theme === 'light';
  const [expandedStep, setExpandedStep] = useState<number>(1);

  return (
    <section
      aria-label="Step-by-Step Security Architecture Roadmap"
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <p
            className={`text-xs font-medium tracking-wide ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            Zero-Trust Security Architecture · Admin-Only Provisioning
          </p>
          <h2
            className={`font-display font-semibold tracking-tight text-balance ${
              compact ? 'text-xl' : 'text-2xl'
            } ${isLight ? 'text-slate-950' : 'text-slate-50'}`}
          >
            Step-by-Step Implementation &amp; Security Roadmap
          </h2>
          <p
            className={`text-sm leading-relaxed font-body ${
              isLight ? 'text-slate-600' : 'text-slate-400'
            }`}
          >
            Six layered controls protect sign-in, eliminate public self-registration, isolate personal data, and record every administrator action in an immutable Firestore audit ledger.
          </p>
        </div>

        <div
          className={`flex items-center gap-3 text-xs font-mono tabular-nums shrink-0 ${
            isLight ? 'text-slate-600' : 'text-slate-400'
          }`}
        >
          <span className={isLight ? 'text-emerald-700 font-semibold' : 'text-emerald-400 font-semibold'}>
            5 / 6 Enforced
          </span>
          <span aria-hidden="true">·</span>
          <span>Policy: Admin-Only Sign-Up</span>
        </div>
      </div>

      {/* Step-by-Step Timeline List (Single-Elevation Hairline Dividers, Zero Nested Cards) */}
      <div
        className={`rounded-xl border divide-y ${
          isLight
            ? 'bg-white border-slate-200 divide-slate-200'
            : 'bg-slate-900 border-slate-800 divide-slate-800'
        }`}
      >
        {SECURITY_ROADMAP_PHASES.map((phase) => {
          const isOpen = expandedStep === phase.step;
          const isEnforced = phase.status === 'ENFORCED';
          return (
            <div key={phase.step} className="transition-colors">
              <button
                type="button"
                onClick={() => setExpandedStep(isOpen ? 0 : phase.step)}
                aria-expanded={isOpen}
                className={`w-full text-left px-5 py-4 flex items-center justify-between gap-4 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${
                  isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start sm:items-center gap-4 min-w-0">
                  <span
                    className={`font-mono tabular-nums text-xs font-semibold w-7 shrink-0 pt-0.5 sm:pt-0 ${
                      isEnforced
                        ? isLight
                          ? 'text-emerald-700'
                          : 'text-emerald-400'
                        : isLight
                        ? 'text-amber-700'
                        : 'text-amber-400'
                    }`}
                  >
                    0{phase.step}.
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span
                        className={`font-display text-sm sm:text-[15px] font-semibold ${
                          isLight ? 'text-slate-950' : 'text-slate-100'
                        }`}
                      >
                        {phase.title}
                      </span>
                      <span
                        aria-hidden="true"
                        className={isLight ? 'text-slate-300' : 'text-slate-700'}
                      >
                        ·
                      </span>
                      <span
                        className={`text-xs ${
                          isLight ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        {phase.layer}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <span
                    className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
                      isEnforced
                        ? isLight
                          ? 'text-emerald-700'
                          : 'text-emerald-400'
                        : isLight
                        ? 'text-amber-700'
                        : 'text-amber-400'
                    }`}
                  >
                    {isEnforced ? (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>{isEnforced ? 'Enforced' : 'Recommended'}</span>
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 opacity-50" />
                  ) : (
                    <ChevronDown className="w-4 h-4 opacity-50" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div
                  className={`px-5 pb-5 pt-1 pl-16 space-y-3 ${
                    isLight ? 'text-slate-600' : 'text-slate-300'
                  }`}
                >
                  <p className="text-sm leading-relaxed max-w-3xl">{phase.summary}</p>
                  <ul className="space-y-2 pt-1">
                    {phase.controls.map((control) => (
                      <li key={control} className="flex items-start gap-2.5 text-[13px] leading-snug">
                        <Check
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            isEnforced
                              ? isLight
                                ? 'text-emerald-600'
                                : 'text-emerald-400'
                              : isLight
                              ? 'text-amber-600'
                              : 'text-amber-400'
                          }`}
                        />
                        <span>{control}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
