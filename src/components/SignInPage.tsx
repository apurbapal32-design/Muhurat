import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Lock,
  LogOut,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useAuthAccess } from '../hooks/useAuthAccess';
import { submitUserAccessRequest } from '../lib/adminAccessService';
import {
  BLUEPRINT_LIMITS,
  MASTER_ADMIN_EMAIL,
  RequestableRole,
} from '../utils/adminAuthSecurity';
import { SecurityRoadmapPanel } from './SecurityRoadmapPanel';

interface SignInPageProps {
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  onNavigateTab: (tab: string) => void;
}

const VAULT_IMAGE_URL = '/src/assets/images/signin_institutional_vault_1795598781651.jpg';

const GoogleMark: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45c-.28 1.48-1.12 2.74-2.38 3.58v2.97h3.85c2.25-2.07 3.57-5.12 3.57-8.58z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.85-2.97c-1.07.72-2.45 1.15-4.1 1.15-3.15 0-5.82-2.13-6.77-4.99H1.25v3.07C3.23 21.3 7.3 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.23 14.29A7.18 7.18 0 0 1 4.86 12c0-.79.14-1.56.37-2.29V6.64H1.25A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.25 5.36l3.98-3.07z"
    />
    <path
      fill="#EA4335"
      d="M12 4.72c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0 7.3 0 3.23 2.7 1.25 6.64l3.98 3.07C6.18 6.85 8.85 4.72 12 4.72z"
    />
  </svg>
);

export const SignInPage: React.FC<SignInPageProps> = ({ theme = 'dark', onNavigateTab }) => {
  const isLight = theme === 'light';
  const {
    firebaseUser,
    authReady,
    isBusy,
    accessState,
    isAdmin,
    isMasterAdmin,
    canAccessTerminal,
    authorizedUser,
    accessRequest,
    serverSession,
    authError,
    signInWithGoogle,
    signOutUser,
    refreshAccess,
    clearAuthError,
  } = useAuthAccess();

  const [imgFailed, setImgFailed] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [reqName, setReqName] = useState('');
  const [reqRole, setReqRole] = useState<RequestableRole>('TRADER');
  const [reqReason, setReqReason] = useState('');
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqFeedback, setReqFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setReqFeedback(null);
    setReqSubmitting(true);
    try {
      await submitUserAccessRequest(firebaseUser, {
        displayName: reqName || firebaseUser.displayName || '',
        requestedRole: reqRole,
        reason: reqReason,
      });
      await refreshAccess();
      setReqFeedback({
        type: 'success',
        message: 'Access request submitted to the Administrator queue. You will gain entry once approved.',
      });
    } catch (err) {
      setReqFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to submit access request.',
      });
    } finally {
      setReqSubmitting(false);
    }
  };

  return (
    <div
      className={`min-h-screen w-full font-body ${
        isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Top Minimal 3-Zone Navigation Bar */}
      <header
        className={`w-full border-b ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-950/90 border-slate-800/90'
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="/"
            className={`font-display text-base font-semibold tracking-tight whitespace-nowrap shrink-0 ${
              isLight ? 'text-slate-950' : 'text-slate-50'
            }`}
          >
            Muhurat Terminal
          </a>

          <nav aria-label="Portal Navigation" className="hidden md:flex items-center gap-6 text-sm font-medium">
            <a
              href="/"
              className={`whitespace-nowrap shrink-0 transition-colors ${
                isLight ? 'text-slate-600 hover:text-slate-950' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Live Terminal
            </a>
            <button
              type="button"
              onClick={() => onNavigateTab('agent-management')}
              className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isLight ? 'text-slate-600 hover:text-slate-950' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              AI Agents
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('order-flow-scanner')}
              className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isLight ? 'text-slate-600 hover:text-slate-950' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Order Flow
            </button>
            <button
              type="button"
              onClick={() => setShowRoadmap((v) => !v)}
              className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                showRoadmap
                  ? isLight
                    ? 'text-slate-950 font-semibold'
                    : 'text-amber-400 font-semibold'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-950'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Security Roadmap
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateTab('admin')}
              className={`px-4 py-2 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isLight
                  ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                  : 'bg-slate-900 text-slate-100 border-slate-700 hover:bg-slate-800'
              }`}
            >
              Admin Console
            </button>
          </div>
        </div>
      </header>

      {/* Main Balanced Split-Viewport Auth Architecture */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-12">
        <div
          className={`grid grid-cols-1 lg:grid-cols-12 items-stretch rounded-2xl overflow-hidden border ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          {/* Left 6 Columns: Institutional Architectural Brand Panel */}
          <div className="lg:col-span-6 relative min-h-[340px] lg:min-h-[640px] flex flex-col justify-between bg-slate-950 overflow-hidden">
            {!imgFailed ? (
              <img
                src={VAULT_IMAGE_URL}
                alt="Minimalist obsidian and bronze institutional financial vault hallway"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/30" />
            )}
            {/* Measured Contrast Scrim for WCAG AA >= 4.5:1 text legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/40" />

            <div className="relative z-10 p-8 sm:p-10">
              <p className="text-xs font-medium tracking-wide text-amber-300/90">
                Institutional Access Gate · NSE F&amp;O Desk
              </p>
            </div>

            <div className="relative z-10 p-8 sm:p-10 space-y-6">
              <div className="space-y-3 max-w-lg">
                <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-[1.15] text-balance">
                  Controlled access for institutional order flow desks.
                </h1>
                <p className="text-sm sm:text-[15px] leading-relaxed text-slate-300">
                  Public sign-up is disabled by architecture. Every trader account is explicitly authorized from the Administrator Control Center and enforced at the database layer.
                </p>
              </div>

              <div className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
                <div className="space-y-1">
                  <div className="font-display font-semibold text-white">Admin-Only Sign-Up</div>
                  <p className="text-slate-400 leading-relaxed">
                    New accounts require direct Admin allowlist provisioning.
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="font-display font-semibold text-white">Verified Identity</div>
                  <p className="text-slate-400 leading-relaxed">
                    Google OAuth tokens verified cryptographically on every session.
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="font-display font-semibold text-white">Immutable Audit</div>
                  <p className="text-slate-400 leading-relaxed">
                    Every approval, role change, and revocation is permanently logged.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right 6 Columns: Serene Authentication & Authorization Workspace */}
          <div className="lg:col-span-6 p-8 sm:p-12 lg:p-14 flex flex-col justify-between">
            <div className="w-full max-w-md mx-auto my-auto space-y-7">
              {!authReady ? (
                <div className="space-y-4 py-12">
                  <div className={`h-6 w-44 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                  <div className={`h-4 w-72 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                  <div className={`h-11 w-full rounded-lg ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                </div>
              ) : !firebaseUser ? (
                /* STATE 1: UNAUTHENTICATED SIGN-IN */
                <>
                  <div className="space-y-2">
                    <p
                      className={`text-xs font-medium ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      Verified Google Identity · Zero Self-Registration
                    </p>
                    <h2
                      className={`font-display text-2xl sm:text-[28px] font-semibold tracking-tight ${
                        isLight ? 'text-slate-950' : 'text-white'
                      }`}
                    >
                      Sign in to your desk
                    </h2>
                    <p
                      className={`text-sm leading-relaxed ${
                        isLight ? 'text-slate-600' : 'text-slate-400'
                      }`}
                    >
                      Authenticate with your authorized Google account. Administrators sign in directly to manage user access and security controls.
                    </p>
                  </div>

                  {authError && (
                    <div
                      role="alert"
                      className={`p-3.5 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                        isLight
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-rose-950/50 border-rose-800/70 text-rose-200'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{authError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={clearAuthError}
                        className="text-xs underline shrink-0 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={signInWithGoogle}
                      disabled={isBusy}
                      className={`w-full h-12 px-5 rounded-lg font-display text-sm font-semibold flex items-center justify-center gap-3 transition-[background-color,transform] duration-200 active:scale-[0.99] cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                        isLight
                          ? 'bg-slate-950 hover:bg-slate-800 text-white'
                          : 'bg-white hover:bg-slate-100 text-slate-950'
                      }`}
                    >
                      {isBusy ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <GoogleMark />
                      )}
                      <span>{isBusy ? 'Verifying Google Identity...' : 'Continue with Google'}</span>
                    </button>

                    <div
                      className={`pt-4 border-t space-y-2.5 text-xs ${
                        isLight ? 'border-slate-200 text-slate-600' : 'border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <Lock className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-amber-700' : 'text-amber-400'}`} />
                        <span className={isLight ? 'text-slate-900' : 'text-slate-200'}>
                          Sign-Up Permission Policy
                        </span>
                      </div>
                      <p className="leading-relaxed">
                        Direct public sign-up is disabled. If your email has not been pre-authorized by the Administrator, signing in with Google lets you submit a verified access request for review in the Admin Console.
                      </p>
                    </div>
                  </div>
                </>
              ) : canAccessTerminal ? (
                /* STATE 2: AUTHENTICATED & AUTHORIZED (MASTER ADMIN OR APPROVED MEMBER) */
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div
                      className={`flex items-center gap-2 text-xs font-medium ${
                        isLight ? 'text-emerald-700' : 'text-emerald-400'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        {isMasterAdmin
                          ? 'Master Administrator Verified'
                          : isAdmin
                          ? 'Administrator Verified'
                          : 'Authorized Desk Member'}
                      </span>
                      {serverSession?.verified && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Server Token Verified</span>
                        </>
                      )}
                    </div>
                    <h2
                      className={`font-display text-2xl font-semibold tracking-tight ${
                        isLight ? 'text-slate-950' : 'text-white'
                      }`}
                    >
                      Welcome back, {firebaseUser.displayName || authorizedUser?.displayName || 'Trader'}
                    </h2>
                    <p
                      className={`text-sm font-mono ${
                        isLight ? 'text-slate-600' : 'text-slate-400'
                      }`}
                    >
                      {firebaseUser.email}
                    </p>
                  </div>

                  <div
                    className={`rounded-xl border divide-y text-xs ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 divide-slate-200'
                        : 'bg-slate-950/60 border-slate-800 divide-slate-800'
                    }`}
                  >
                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                      <span className="opacity-65">Role &amp; Clearance</span>
                      <span className="font-mono font-semibold">
                        {isMasterAdmin
                          ? 'MASTER ADMIN'
                          : authorizedUser?.role || (isAdmin ? 'ADMIN' : 'TRADER')}
                      </span>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                      <span className="opacity-65">Plan Tier</span>
                      <span className="font-mono font-semibold">
                        {isMasterAdmin ? 'ADMIN_MASTER' : authorizedUser?.planTier || 'PRO'}
                      </span>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                      <span className="opacity-65">Account Status</span>
                      <span
                        className={`font-semibold ${
                          isLight ? 'text-emerald-700' : 'text-emerald-400'
                        }`}
                      >
                        Active &amp; Verified
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab('admin')}
                        className="w-full h-11 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Shield className="w-4 h-4" />
                        <span>Open Admin Control Center</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}

                    <a
                      href="/"
                      className={`w-full h-11 px-5 rounded-lg font-display text-sm font-semibold flex items-center justify-center gap-2 border transition-colors ${
                        isLight
                          ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
                          : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                      }`}
                    >
                      <span>Enter Muhurat Live Terminal</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>

                    <button
                      type="button"
                      onClick={signOutUser}
                      disabled={isBusy}
                      className={`w-full h-10 px-4 rounded-lg text-xs font-medium flex items-center justify-center gap-2 border transition-colors cursor-pointer ${
                        isLight
                          ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                          : 'border-slate-800 text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                      }`}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* STATE 3: AUTHENTICATED BUT NOT AUTHORIZED / PENDING / SUSPENDED / REJECTED */
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div
                      className={`flex items-center gap-2 text-xs font-medium ${
                        accessState === 'PENDING_APPROVAL'
                          ? isLight
                            ? 'text-amber-700'
                            : 'text-amber-400'
                          : isLight
                          ? 'text-rose-700'
                          : 'text-rose-400'
                      }`}
                    >
                      {accessState === 'PENDING_APPROVAL' ? (
                        <Clock className="w-4 h-4" />
                      ) : (
                        <ShieldAlert className="w-4 h-4" />
                      )}
                      <span>
                        {accessState === 'PENDING_APPROVAL'
                          ? 'Awaiting Administrator Approval'
                          : accessState === 'SUSPENDED'
                          ? 'Account Suspended by Administrator'
                          : accessState === 'REVOKED'
                          ? 'Access Revoked'
                          : accessState === 'REJECTED'
                          ? 'Access Request Declined'
                          : accessState === 'UNVERIFIED_EMAIL'
                          ? 'Email Verification Required'
                          : 'Admin Permission Required'}
                      </span>
                    </div>

                    <h2
                      className={`font-display text-2xl font-semibold tracking-tight ${
                        isLight ? 'text-slate-950' : 'text-white'
                      }`}
                    >
                      {accessState === 'PENDING_APPROVAL'
                        ? 'Your request is in review'
                        : 'Sign-up requires Admin approval'}
                    </h2>
                    <p className={`text-xs font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                      Signed in as {firebaseUser.email}
                    </p>
                  </div>

                  {reqFeedback && (
                    <div
                      role="status"
                      className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                        reqFeedback.type === 'success'
                          ? isLight
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-emerald-950/40 border-emerald-800/70 text-emerald-200'
                          : isLight
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-rose-950/40 border-rose-800/70 text-rose-200'
                      }`}
                    >
                      {reqFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <span>{reqFeedback.message}</span>
                    </div>
                  )}

                  {accessState === 'NOT_AUTHORIZED' ? (
                    <form onSubmit={handleRequestSubmit} className="space-y-4">
                      <div>
                        <label
                          htmlFor="req-display-name"
                          className={`block text-xs font-medium mb-1.5 ${
                            isLight ? 'text-slate-700' : 'text-slate-300'
                          }`}
                        >
                          Full Name
                        </label>
                        <input
                          id="req-display-name"
                          type="text"
                          required
                          maxLength={BLUEPRINT_LIMITS.DISPLAY_NAME_MAX}
                          value={reqName || firebaseUser.displayName || ''}
                          onChange={(e) => setReqName(e.target.value)}
                          placeholder="Your full name"
                          className={`w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors ${
                            isLight
                              ? 'bg-white border-slate-300 text-slate-900 focus:border-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white focus:border-amber-400'
                          }`}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="req-role"
                          className={`block text-xs font-medium mb-1.5 ${
                            isLight ? 'text-slate-700' : 'text-slate-300'
                          }`}
                        >
                          Requested Desk Role
                        </label>
                        <select
                          id="req-role"
                          value={reqRole}
                          onChange={(e) => setReqRole(e.target.value as RequestableRole)}
                          className={`w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors ${
                            isLight
                              ? 'bg-white border-slate-300 text-slate-900 focus:border-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white focus:border-amber-400'
                          }`}
                        >
                          <option value="TRADER">Trader (Live Scanners &amp; Order Flow)</option>
                          <option value="ANALYST">Analyst (Research &amp; Diagnostics)</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="req-reason"
                          className={`block text-xs font-medium mb-1.5 ${
                            isLight ? 'text-slate-700' : 'text-slate-300'
                          }`}
                        >
                          Desk / Reason for Access
                        </label>
                        <textarea
                          id="req-reason"
                          rows={3}
                          maxLength={BLUEPRINT_LIMITS.REASON_MAX}
                          value={reqReason}
                          onChange={(e) => setReqReason(e.target.value)}
                          placeholder="Briefly state your trading desk or team..."
                          className={`w-full p-3 rounded-lg border text-sm outline-none transition-colors resize-none ${
                            isLight
                              ? 'bg-white border-slate-300 text-slate-900 focus:border-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white focus:border-amber-400'
                          }`}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={reqSubmitting}
                        className="w-full h-11 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>{reqSubmitting ? 'Submitting Request...' : 'Request Admin Permission'}</span>
                      </button>
                    </form>
                  ) : (
                    <div
                      className={`p-4 rounded-xl border text-xs leading-relaxed space-y-2 ${
                        isLight
                          ? 'bg-slate-50 border-slate-200 text-slate-700'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300'
                      }`}
                    >
                      {accessState === 'PENDING_APPROVAL' && (
                        <>
                          <p>
                            Your access request for role <strong className="font-mono">{accessRequest?.requestedRole}</strong> is queued for review by the Administrator ({MASTER_ADMIN_EMAIL}).
                          </p>
                          <p className="opacity-75">
                            Once provisioned in the Admin Control Center, click Refresh Status below to enter immediately.
                          </p>
                        </>
                      )}
                      {accessState === 'REJECTED' && (
                        <p>
                          Your previous access request was declined.
                          {accessRequest?.reviewNote ? ` Note: ${accessRequest.reviewNote}` : ''}
                        </p>
                      )}
                      {(accessState === 'SUSPENDED' || accessState === 'REVOKED') && (
                        <p>
                          Your account authorization is currently <strong className="font-mono">{accessState}</strong>. Contact the Administrator to restore access.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={refreshAccess}
                      disabled={isBusy}
                      className={`flex-1 h-10 px-4 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        isLight
                          ? 'border-slate-300 text-slate-800 hover:bg-slate-100'
                          : 'border-slate-700 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                      <span>Refresh Status</span>
                    </button>
                    <button
                      type="button"
                      onClick={signOutUser}
                      disabled={isBusy}
                      className={`flex-1 h-10 px-4 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        isLight
                          ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                          : 'border-slate-800 text-slate-400 hover:bg-slate-800/70'
                      }`}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Switch Account</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quiet Footer Navigation inside Right Pane */}
            <div
              className={`pt-6 mt-8 border-t flex flex-wrap items-center justify-between gap-3 text-xs ${
                isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
              }`}
            >
              <a
                href="/"
                className={`inline-flex items-center gap-1.5 transition-colors ${
                  isLight ? 'hover:text-slate-900' : 'hover:text-slate-200'
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Terminal</span>
              </a>
              <button
                type="button"
                onClick={() => setShowRoadmap((v) => !v)}
                className={`cursor-pointer transition-colors ${
                  isLight ? 'hover:text-slate-900' : 'hover:text-slate-200'
                }`}
              >
                {showRoadmap ? 'Hide Security Roadmap' : 'View 6-Step Security Roadmap'}
              </button>
            </div>
          </div>
        </div>

        {/* Expandable Step-by-Step Security Roadmap Section */}
        {showRoadmap && (
          <div className="pt-2">
            <SecurityRoadmapPanel theme={theme} />
          </div>
        )}
      </main>
    </div>
  );
};
