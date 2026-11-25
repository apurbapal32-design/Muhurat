import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react';
import { useAuthAccess } from '../hooks/useAuthAccess';
import {
  adminApproveAccessRequest,
  adminDeleteAuthorizedUser,
  adminProvisionUser,
  adminRejectAccessRequest,
  adminUpdateAuthorizedUser,
  subscribeMasterAdminData,
} from '../lib/adminAccessService';
import {
  AccessRequestRecord,
  AdminAuditLogRecord,
  AuthorizedUserRecord,
  BLUEPRINT_LIMITS,
  MASTER_ADMIN_EMAIL,
  PlanTier,
  UserRole,
} from '../utils/adminAuthSecurity';
import { SecurityRoadmapPanel } from './SecurityRoadmapPanel';

interface AdminControlPageProps {
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  onNavigateTab: (tab: string) => void;
}

type AdminSectionTab = 'directory' | 'requests' | 'audit' | 'roadmap';
type DirectoryFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'ADMIN';

function formatFirestoreTimestamp(ts: unknown): string {
  if (!ts) return 'Just now';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as any).toDate === 'function') {
    const d: Date = (ts as any).toDate();
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
  return '—';
}

export const AdminControlPage: React.FC<AdminControlPageProps> = ({
  theme = 'dark',
  onNavigateTab,
}) => {
  const isLight = theme === 'light';
  const {
    firebaseUser,
    authReady,
    isBusy,
    isAdmin,
    isMasterAdmin,
    serverSession,
    signInWithGoogle,
    signOutUser,
  } = useAuthAccess();

  const [sectionTab, setSectionTab] = useState<AdminSectionTab>('directory');
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUserRecord[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequestRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogRecord[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [serverPosture, setServerPosture] = useState<Record<string, boolean> | null>(null);

  // Admin-Only Sign-Up Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('TRADER');
  const [planTier, setPlanTier] = useState<PlanTier>('PRO');
  const [department, setDepartment] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Directory filters & inline confirm
  const [searchQuery, setSearchQuery] = useState('');
  const [dirFilter, setDirFilter] = useState<DirectoryFilter>('ALL');
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null);

  // Attach Firestore listeners ONLY when verified Master Admin is authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser || !isMasterAdmin) {
      setAuthorizedUsers([]);
      setAccessRequests([]);
      setAuditLogs([]);
      return;
    }

    setDataLoading(true);
    setDataError(null);
    const unsub = subscribeMasterAdminData({
      onAuthorizedUsers: (rows) => {
        setAuthorizedUsers(rows);
        setDataLoading(false);
      },
      onAccessRequests: (rows) => {
        setAccessRequests(rows);
      },
      onAuditLogs: (rows) => {
        setAuditLogs(rows);
      },
      onError: (err) => {
        setDataError(err.message);
        setDataLoading(false);
      },
    });

    // Also fetch server-side verified admin security posture
    firebaseUser
      .getIdToken()
      .then((token) =>
        fetch('/api/admin/security-status', {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.protections) setServerPosture(json.protections);
      })
      .catch(() => {});

    return () => unsub();
  }, [authReady, firebaseUser, isMasterAdmin]);

  const pendingRequests = useMemo(
    () => accessRequests.filter((r) => r.status === 'PENDING'),
    [accessRequests]
  );

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return authorizedUsers.filter((u) => {
      if (dirFilter === 'ACTIVE' && u.status !== 'ACTIVE') return false;
      if (dirFilter === 'SUSPENDED' && u.status !== 'SUSPENDED') return false;
      if (dirFilter === 'ADMIN' && u.role !== 'ADMIN') return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [authorizedUsers, searchQuery, dirFilter]);

  const activeUserCount = useMemo(
    () => authorizedUsers.filter((u) => u.status === 'ACTIVE').length,
    [authorizedUsers]
  );
  const adminRoleCount = useMemo(
    () => authorizedUsers.filter((u) => u.role === 'ADMIN' && u.status === 'ACTIVE').length + 1,
    [authorizedUsers]
  );

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setBanner(null);
    setSubmitting(true);
    try {
      const res = await adminProvisionUser(firebaseUser, {
        displayName: fullName,
        email,
        role,
        planTier,
        department,
        notes,
      });
      setFullName('');
      setEmail('');
      setDepartment('');
      setNotes('');
      setRole('TRADER');
      setPlanTier('PRO');
      setBanner({
        type: 'success',
        message: `Authorized ${res.email}. They can now sign in with Google immediately.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to authorize account.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveRequest = async (reqRecord: AccessRequestRecord) => {
    if (!firebaseUser) return;
    setBanner(null);
    setBusyRowKey(reqRecord.uid);
    try {
      await adminApproveAccessRequest(
        firebaseUser,
        reqRecord,
        reqRecord.requestedRole,
        'PRO',
        'Approved via Admin Control Center'
      );
      setBanner({
        type: 'success',
        message: `Approved ${reqRecord.email} as ${reqRecord.requestedRole} and recorded audit log.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to approve request.',
      });
    } finally {
      setBusyRowKey(null);
    }
  };

  const handleRejectRequest = async (reqRecord: AccessRequestRecord) => {
    if (!firebaseUser) return;
    setBanner(null);
    setBusyRowKey(reqRecord.uid);
    try {
      await adminRejectAccessRequest(firebaseUser, reqRecord, 'Access not approved at this time.');
      setBanner({
        type: 'success',
        message: `Declined access request from ${reqRecord.email}.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to decline request.',
      });
    } finally {
      setBusyRowKey(null);
    }
  };

  const handleToggleSuspend = async (target: AuthorizedUserRecord) => {
    if (!firebaseUser) return;
    setBanner(null);
    setBusyRowKey(target.emailKey);
    const nextStatus = target.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await adminUpdateAuthorizedUser(firebaseUser, target, { status: nextStatus });
      setBanner({
        type: 'success',
        message:
          nextStatus === 'SUSPENDED'
            ? `Suspended ${target.email}. Access blocked immediately.`
            : `Reactivated ${target.email}.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update account status.',
      });
    } finally {
      setBusyRowKey(null);
    }
  };

  const handleRoleChange = async (target: AuthorizedUserRecord, nextRole: UserRole) => {
    if (!firebaseUser) return;
    setBanner(null);
    setBusyRowKey(target.emailKey);
    try {
      await adminUpdateAuthorizedUser(firebaseUser, target, { role: nextRole });
      setBanner({
        type: 'success',
        message: `Updated ${target.email} role to ${nextRole}.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update role.',
      });
    } finally {
      setBusyRowKey(null);
    }
  };

  const handleConfirmDelete = async (target: AuthorizedUserRecord) => {
    if (!firebaseUser) return;
    setBanner(null);
    setBusyRowKey(target.emailKey);
    try {
      await adminDeleteAuthorizedUser(firebaseUser, target);
      setPendingDeleteKey(null);
      setBanner({
        type: 'success',
        message: `Revoked and removed ${target.email} from the authorized allowlist.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to revoke user.',
      });
    } finally {
      setBusyRowKey(null);
    }
  };

  // =========================================================================
  // ACCESS GATE: Loading / Unauthenticated / Non-Admin 403 Wall
  // =========================================================================
  if (!authReady) {
    return (
      <div className="max-w-5xl mx-auto py-12 space-y-6">
        <div className={`h-8 w-64 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`h-24 rounded-xl ${isLight ? 'bg-slate-200' : 'bg-slate-900'}`} />
          ))}
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="max-w-5xl mx-auto py-10 space-y-10">
        <div
          className={`rounded-2xl border p-8 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="space-y-2 max-w-xl">
            <p className={`text-xs font-medium ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
              Restricted Console · Administrator Authentication Required
            </p>
            <h1
              className={`font-display text-2xl sm:text-3xl font-semibold tracking-tight ${
                isLight ? 'text-slate-950' : 'text-white'
              }`}
            >
              Admin Control Center
            </h1>
            <p className={`text-sm leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Sign in with a verified Administrator Google account to provision new users, approve access requests, and review immutable audit logs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={isBusy}
              className="h-11 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <Lock className="w-4 h-4" />
              <span>{isBusy ? 'Verifying...' : 'Sign In as Admin'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('sign-in')}
              className={`h-11 px-4 rounded-lg border text-sm font-medium cursor-pointer transition-colors whitespace-nowrap ${
                isLight
                  ? 'border-slate-300 text-slate-800 hover:bg-slate-100'
                  : 'border-slate-700 text-slate-200 hover:bg-slate-800'
              }`}
            >
              Open Sign-In Portal
            </button>
          </div>
        </div>

        {/* Publicly inspectable Security Roadmap even before sign-in (contains zero private user data) */}
        <SecurityRoadmapPanel theme={theme} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-12 space-y-6">
        <div
          className={`rounded-2xl border p-8 sm:p-10 space-y-5 ${
            isLight ? 'bg-white border-rose-200' : 'bg-slate-900 border-rose-900/60'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-rose-500">
            <ShieldAlert className="w-4 h-4" />
            <span>403 Forbidden · Administrator Clearance Required</span>
          </div>
          <h1
            className={`font-display text-2xl font-semibold tracking-tight ${
              isLight ? 'text-slate-950' : 'text-white'
            }`}
          >
            This workspace is restricted to Administrators
          </h1>
          <p className={`text-sm leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Your current identity (<span className="font-mono">{firebaseUser.email}</span>) does not hold Administrator privileges. Firestore Security Rules and server middleware block all directory reads and provisioning writes for non-admin sessions.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigateTab('sign-in')}
              className="h-10 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium cursor-pointer transition-colors"
            >
              Return to Sign-In Status
            </button>
            <button
              type="button"
              onClick={signOutUser}
              className={`h-10 px-4 rounded-lg border text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors ${
                isLight
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VERIFIED ADMINISTRATOR CONSOLE
  // =========================================================================
  return (
    <div className="max-w-[1440px] mx-auto py-6 space-y-8 font-body">
      {/* Top Breadcrumb & Primary Action Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div
            className={`flex items-center gap-2 text-xs font-medium ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            <span>Administration</span>
            <span aria-hidden="true">/</span>
            <span className={isLight ? 'text-slate-900' : 'text-slate-200'}>
              Access &amp; Security Control
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{firebaseUser.email}</span>
          </div>
          <h1
            className={`font-display text-2xl sm:text-3xl font-semibold tracking-tight ${
              isLight ? 'text-slate-950' : 'text-white'
            }`}
          >
            Admin Control Center
          </h1>
          <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Exclusive sign-up provisioning, access request approvals, and real-time security governance.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab('sign-in')}
            className={`h-10 px-4 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              isLight
                ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            View Sign-In Portal
          </button>
          <button
            type="button"
            onClick={signOutUser}
            className={`h-10 px-4 rounded-lg border text-xs font-medium flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              isLight
                ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* 4-Column Tabular KPI Summary Strip (Single Elevation, Hairline Borders) */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border divide-y sm:divide-y-0 sm:divide-x ${
          isLight
            ? 'bg-white border-slate-200 divide-slate-200'
            : 'bg-slate-900 border-slate-800 divide-slate-800'
        }`}
      >
        <div className="p-5 space-y-1">
          <p className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Authorized Accounts
          </p>
          <div className="font-mono tabular-nums text-2xl font-semibold">
            {activeUserCount}
          </div>
          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {authorizedUsers.length} total allowlist entries
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Pending Requests
          </p>
          <div
            className={`font-mono tabular-nums text-2xl font-semibold ${
              pendingRequests.length > 0
                ? isLight
                  ? 'text-amber-600'
                  : 'text-amber-400'
                : ''
            }`}
          >
            {pendingRequests.length}
          </div>
          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Awaiting admin review
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Active Administrators
          </p>
          <div className="font-mono tabular-nums text-2xl font-semibold">
            {adminRoleCount}
          </div>
          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Master + delegated admins
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Security Enforcement
          </p>
          <div
            className={`font-mono tabular-nums text-2xl font-semibold ${
              isLight ? 'text-emerald-700' : 'text-emerald-400'
            }`}
          >
            {serverPosture && serverSession?.verified ? '7 / 7' : '8 Pillars'}
          </div>
          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Zero self-signup · Rules live
          </p>
        </div>
      </div>

      {/* Global Action Feedback Banner */}
      {(banner || dataError) && (
        <div
          role="status"
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-4 ${
            dataError || banner?.type === 'error'
              ? isLight
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-rose-950/40 border-rose-800/70 text-rose-200'
              : isLight
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-emerald-950/40 border-emerald-800/70 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {dataError || banner?.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{dataError || banner?.message}</span>
          </div>
          {banner && (
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Segmented Navigation Bar */}
      <div
        role="tablist"
        aria-label="Admin Console Sections"
        className={`inline-flex flex-wrap items-center gap-1 p-1 rounded-xl border ${
          isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}
      >
        {(
          [
            { id: 'directory', label: 'Sign-Up & Users', count: authorizedUsers.length, Icon: Users },
            { id: 'requests', label: 'Access Requests', count: pendingRequests.length, Icon: UserCheck },
            { id: 'audit', label: 'Security Audit Log', count: auditLogs.length, Icon: ClipboardList },
            { id: 'roadmap', label: 'Security Roadmap', count: 6, Icon: ShieldCheck },
          ] as const
        ).map(({ id, label, count, Icon }) => {
          const active = sectionTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSectionTab(id)}
              className={`h-9 px-3.5 rounded-lg text-xs font-medium flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                active
                  ? isLight
                    ? 'bg-white text-slate-950 font-semibold shadow-2xs'
                    : 'bg-slate-800 text-white font-semibold'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-950'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              <span className="font-mono tabular-nums opacity-65">{count}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ADMIN-ONLY SIGN-UP FORM + AUTHORIZED DIRECTORY */}
      {sectionTab === 'directory' && (
        <div className="space-y-8">
          {/* Admin-Only Sign-Up / User Authorization Form */}
          <section
            aria-label="Authorize New User Account"
            className={`rounded-xl border p-6 space-y-5 ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800/40">
              <div>
                <h2
                  className={`font-display text-base font-semibold ${
                    isLight ? 'text-slate-950' : 'text-white'
                  }`}
                >
                  Admin-Only Sign-Up · Provision Authorized User
                </h2>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Only accounts added here are permitted by Firestore Security Rules to create a profile and access the trading terminal.
                </p>
              </div>
              <span
                className={`text-xs font-mono shrink-0 ${
                  isLight ? 'text-emerald-700' : 'text-emerald-400'
                }`}
              >
                Atomic Allowlist + Audit Log
              </span>
            </div>

            <form onSubmit={handleProvisionSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-3">
                <label
                  htmlFor="prov-name"
                  className={`block text-xs font-medium mb-1.5 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Full Name
                </label>
                <input
                  id="prov-name"
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.DISPLAY_NAME_MAX}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Rohan Deshmukh"
                  className={`w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-slate-900'
                      : 'bg-slate-950 border-slate-700 text-white focus:border-amber-400'
                  }`}
                />
              </div>

              <div className="md:col-span-4">
                <label
                  htmlFor="prov-email"
                  className={`block text-xs font-medium mb-1.5 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Google Email Address
                </label>
                <input
                  id="prov-email"
                  type="email"
                  required
                  maxLength={BLUEPRINT_LIMITS.EMAIL_MAX}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@gmail.com"
                  className={`w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-slate-900'
                      : 'bg-slate-950 border-slate-700 text-white focus:border-amber-400'
                  }`}
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="prov-role"
                  className={`block text-xs font-medium mb-1.5 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Role
                </label>
                <select
                  id="prov-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className={`w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-slate-900'
                      : 'bg-slate-950 border-slate-700 text-white focus:border-amber-400'
                  }`}
                >
                  <option value="TRADER">Trader</option>
                  <option value="ANALYST">Analyst</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label
                  htmlFor="prov-tier"
                  className={`block text-xs font-medium mb-1.5 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Plan Tier
                </label>
                <select
                  id="prov-tier"
                  value={planTier}
                  onChange={(e) => setPlanTier(e.target.value as PlanTier)}
                  className={`w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-slate-900'
                      : 'bg-slate-950 border-slate-700 text-white focus:border-amber-400'
                  }`}
                >
                  <option value="PRO">Pro Desk</option>
                  <option value="INSTITUTIONAL">Institutional</option>
                  <option value="ADMIN_MASTER">Admin Master</option>
                </select>
              </div>

              <div className="md:col-span-4">
                <label
                  htmlFor="prov-dept"
                  className={`block text-xs font-medium mb-1.5 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Desk / Department (Optional)
                </label>
                <input
                  id="prov-dept"
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.DEPARTMENT_MAX}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Nifty F&O Order Flow"
                  className={`w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-slate-900'
                      : 'bg-slate-950 border-slate-700 text-white focus:border-amber-400'
                  }`}
                />
              </div>

              <div className="md:col-span-5">
                <label
                  htmlFor="prov-notes"
                  className={`block text-xs font-medium mb-1.5 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Provisioning Note (Optional)
                </label>
                <input
                  id="prov-notes"
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.NOTES_MAX}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="KYC / desk verification note"
                  className={`w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-slate-900'
                      : 'bg-slate-950 border-slate-700 text-white focus:border-amber-400'
                  }`}
                />
              </div>

              <div className="md:col-span-3 flex items-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  {submitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>{submitting ? 'Authorizing...' : 'Authorize Account'}</span>
                </button>
              </div>
            </form>
          </section>

          {/* Authorized Users Directory Table */}
          <section
            aria-label="Authorized Users Directory"
            className={`rounded-xl border overflow-hidden ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/40">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-45" />
                <input
                  type="search"
                  aria-label="Search authorized users"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, or desk..."
                  className={`w-full h-9 pl-9 pr-3 rounded-lg border text-xs outline-none transition-colors ${
                    isLight
                      ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-slate-900'
                      : 'bg-slate-950 border-slate-800 text-white focus:border-amber-400'
                  }`}
                />
              </div>

              <div className="flex items-center gap-1">
                {(['ALL', 'ACTIVE', 'SUSPENDED', 'ADMIN'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setDirFilter(f)}
                    className={`h-8 px-3 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                      dirFilter === f
                        ? isLight
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-800 text-white'
                        : isLight
                        ? 'text-slate-600 hover:bg-slate-100'
                        : 'text-slate-400 hover:bg-slate-800/60'
                    }`}
                  >
                    {f === 'ALL' ? 'All' : f === 'ACTIVE' ? 'Active' : f === 'SUSPENDED' ? 'Suspended' : 'Admins'}
                  </button>
                ))}
              </div>
            </div>

            {dataLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((row) => (
                  <div key={row} className={`h-10 rounded ${isLight ? 'bg-slate-100' : 'bg-slate-800/70'}`} />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-10 text-center space-y-1.5">
                <p className={`text-sm font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  No authorized users match this filter yet.
                </p>
                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Use the Admin-Only Sign-Up form above to authorize a trader Google account.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr
                      className={`border-b text-[11px] font-medium ${
                        isLight
                          ? 'bg-slate-50 border-slate-200 text-slate-500'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <th className="py-3 px-5">User</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Plan Tier</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Provisioned</th>
                      <th className="py-3 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800/80'}`}>
                    {filteredUsers.map((u) => {
                      const isRowBusy = busyRowKey === u.emailKey;
                      const isConfirmingDelete = pendingDeleteKey === u.emailKey;
                      return (
                        <tr
                          key={u.emailKey}
                          className={isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'}
                        >
                          <td className="py-3.5 px-5">
                            <div className="font-medium text-sm">{u.displayName}</div>
                            <div className="font-mono text-[11px] opacity-65">
                              {u.email}
                              {u.department ? ` · ${u.department}` : ''}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <select
                              aria-label={`Change role for ${u.displayName}`}
                              disabled={isRowBusy}
                              value={u.role}
                              onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                              className={`h-8 px-2 rounded-md border font-mono text-xs outline-none ${
                                isLight
                                  ? 'bg-white border-slate-300 text-slate-900'
                                  : 'bg-slate-950 border-slate-700 text-slate-200'
                              }`}
                            >
                              <option value="TRADER">TRADER</option>
                              <option value="ANALYST">ANALYST</option>
                              <option value="ADMIN">ADMIN</option>
                            </select>
                          </td>
                          <td className="py-3.5 px-4 font-mono">{u.planTier}</td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-medium ${
                                u.status === 'ACTIVE'
                                  ? isLight
                                    ? 'text-emerald-700'
                                    : 'text-emerald-400'
                                  : u.status === 'SUSPENDED'
                                  ? isLight
                                    ? 'text-amber-700'
                                    : 'text-amber-400'
                                  : isLight
                                  ? 'text-rose-700'
                                  : 'text-rose-400'
                              }`}
                            >
                              {u.status === 'ACTIVE'
                                ? 'Active'
                                : u.status === 'SUSPENDED'
                                ? 'Suspended'
                                : 'Revoked'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono tabular-nums opacity-70">
                            {formatFirestoreTimestamp(u.createdAt)}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <div className="inline-flex items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={isRowBusy}
                                onClick={() => handleToggleSuspend(u)}
                                className={`h-8 px-2.5 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
                                  isLight
                                    ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                                    : 'border-slate-700 text-slate-200 hover:bg-slate-800'
                                }`}
                              >
                                {u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                              </button>

                              {isConfirmingDelete ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isRowBusy}
                                    onClick={() => handleConfirmDelete(u)}
                                    className="h-8 px-2.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium cursor-pointer"
                                  >
                                    Confirm Revoke
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteKey(null)}
                                    className="h-8 px-2 text-xs opacity-70 hover:opacity-100 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isRowBusy}
                                  aria-label={`Revoke access for ${u.displayName}`}
                                  onClick={() => setPendingDeleteKey(u.emailKey)}
                                  className={`h-8 w-8 rounded-md border inline-flex items-center justify-center cursor-pointer transition-colors ${
                                    isLight
                                      ? 'border-slate-200 text-rose-600 hover:bg-rose-50'
                                      : 'border-slate-800 text-rose-400 hover:bg-rose-950/60'
                                  }`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: PENDING ACCESS REQUESTS QUEUE */}
      {sectionTab === 'requests' && (
        <section
          aria-label="User Access Requests Queue"
          className={`rounded-xl border overflow-hidden ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="p-5 border-b border-slate-800/40 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold">Access Requests Queue</h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Verified Google users who attempted sign-in without pre-authorization appear here for explicit approval or rejection.
              </p>
            </div>
            <span className="font-mono tabular-nums text-xs opacity-70">
              {pendingRequests.length} Pending · {accessRequests.length} Total
            </span>
          </div>

          {accessRequests.length === 0 ? (
            <div className="p-10 text-center space-y-1.5">
              <p className="text-sm font-medium">No access requests submitted yet.</p>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Requests submitted from the Sign-In Portal will appear here in real time.
              </p>
            </div>
          ) : (
            <div className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800'}`}>
              {accessRequests.map((req) => {
                const isRowBusy = busyRowKey === req.uid;
                return (
                  <div
                    key={req.uid}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                        <span className="font-display text-sm font-semibold">{req.displayName}</span>
                        <span aria-hidden="true" className="opacity-40">·</span>
                        <span className="font-mono text-xs opacity-75">{req.email}</span>
                        <span aria-hidden="true" className="opacity-40">·</span>
                        <span className="font-mono text-xs font-medium">{req.requestedRole}</span>
                      </div>
                      {req.reason && (
                        <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                          {req.reason}
                        </p>
                      )}
                      <div className="text-[11px] font-mono tabular-nums opacity-60">
                        Submitted {formatFirestoreTimestamp(req.createdAt)} · Status: {req.status}
                        {req.reviewedBy ? ` · Reviewed by ${req.reviewedBy}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {req.status === 'PENDING' ? (
                        <>
                          <button
                            type="button"
                            disabled={isRowBusy}
                            onClick={() => handleApproveRequest(req)}
                            className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Approve &amp; Authorize</span>
                          </button>
                          <button
                            type="button"
                            disabled={isRowBusy}
                            onClick={() => handleRejectRequest(req)}
                            className={`h-9 px-3.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                              isLight
                                ? 'border-slate-300 text-rose-700 hover:bg-rose-50'
                                : 'border-slate-700 text-rose-400 hover:bg-rose-950/50'
                            }`}
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Decline</span>
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-xs font-medium ${
                            req.status === 'APPROVED'
                              ? isLight
                                ? 'text-emerald-700'
                                : 'text-emerald-400'
                              : isLight
                              ? 'text-rose-700'
                              : 'text-rose-400'
                          }`}
                        >
                          {req.status === 'APPROVED' ? 'Approved' : 'Declined'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: IMMUTABLE SECURITY AUDIT LOG */}
      {sectionTab === 'audit' && (
        <section
          aria-label="Immutable Security Audit Log"
          className={`rounded-xl border overflow-hidden ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="p-5 border-b border-slate-800/40 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold">Immutable Security Audit Ledger</h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Append-only Firestore log. Updates and deletions are unconditionally blocked at the database rule level.
              </p>
            </div>
            <span className="font-mono text-xs opacity-65">allow update, delete: false</span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-10 text-center text-xs opacity-70">
              No administrator security events recorded yet. Provisioning or modifying an account will append an immutable entry here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr
                    className={`border-b text-[11px] font-medium ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-500'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <th className="py-3 px-5">Timestamp</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Target Email</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-5">Detail</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800/80'}`}>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'}>
                      <td className="py-3 px-5 font-mono tabular-nums whitespace-nowrap opacity-75">
                        {formatFirestoreTimestamp(log.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap">{log.targetEmail}</td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap opacity-75">{log.actorEmail}</td>
                      <td className="py-3 px-5">{log.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: STEP-BY-STEP SECURITY ROADMAP */}
      {sectionTab === 'roadmap' && <SecurityRoadmapPanel theme={theme} />}
    </div>
  );
};
