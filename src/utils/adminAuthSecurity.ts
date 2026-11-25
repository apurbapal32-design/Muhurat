export const MASTER_ADMIN_EMAIL = 'apurbapal32@gmail.com';

// Synchronized verbatim with firebase-blueprint.json & firestore.rules
export const BLUEPRINT_LIMITS = {
  UID_MIN: 1,
  UID_MAX: 128,
  EMAIL_MIN: 3,
  EMAIL_MAX: 254,
  DISPLAY_NAME_MIN: 1,
  DISPLAY_NAME_MAX: 80,
  DEPARTMENT_MAX: 80,
  NOTES_MAX: 200,
  REASON_MAX: 240,
  REVIEW_NOTE_MAX: 200,
  DETAIL_MAX: 240,
  DOC_ID_MIN: 3,
  DOC_ID_MAX: 128,
} as const;

export const SAFE_DOC_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type UserRole = 'TRADER' | 'ANALYST' | 'ADMIN';
export type RequestableRole = 'TRADER' | 'ANALYST';
export type PlanTier = 'PRO' | 'INSTITUTIONAL' | 'ADMIN_MASTER';
export type AuthorizedStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type AccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AdminAuditAction =
  | 'PROVISION_USER'
  | 'APPROVE_REQUEST'
  | 'REJECT_REQUEST'
  | 'UPDATE_ROLE'
  | 'SUSPEND_USER'
  | 'REACTIVATE_USER'
  | 'REVOKE_USER'
  | 'GRANT_ADMIN'
  | 'REVOKE_ADMIN';

export const ALLOWED_USER_ROLES: readonly UserRole[] = ['TRADER', 'ANALYST', 'ADMIN'];
export const ALLOWED_REQUESTABLE_ROLES: readonly RequestableRole[] = ['TRADER', 'ANALYST'];
export const ALLOWED_PLAN_TIERS: readonly PlanTier[] = ['PRO', 'INSTITUTIONAL', 'ADMIN_MASTER'];
export const ALLOWED_AUTHORIZED_STATUSES: readonly AuthorizedStatus[] = ['ACTIVE', 'SUSPENDED', 'REVOKED'];

export interface AuthorizedUserRecord {
  emailKey: string;
  email: string;
  displayName: string;
  role: UserRole;
  planTier: PlanTier;
  status: AuthorizedStatus;
  department?: string;
  notes?: string;
  provisionedBy: string;
  provisionedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AccessRequestRecord {
  uid: string;
  email: string;
  displayName: string;
  requestedRole: RequestableRole;
  reason: string;
  status: AccessRequestStatus;
  reviewedBy?: string;
  reviewNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminAuditLogRecord {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: AdminAuditAction;
  targetEmail: string;
  detail: string;
  createdAt?: unknown;
}

export interface AdminRecord {
  uid: string;
  email: string;
  displayName: string;
  grantedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AccessResolutionState =
  | 'UNAUTHENTICATED'
  | 'UNVERIFIED_EMAIL'
  | 'MASTER_ADMIN'
  | 'ADMIN'
  | 'AUTHORIZED_MEMBER'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'PENDING_APPROVAL'
  | 'REJECTED'
  | 'NOT_AUTHORIZED';

export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

/**
 * Exact 1-to-1 mirror of Firestore Security Rules `emailToDocId(email)`.
 * Guarantees zero enumeration and collision resistance across Firestore & client.
 */
export function emailToDocId(rawEmail: string): string {
  return normalizeEmail(rawEmail)
    .replace(/_/g, '__')
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/\+/g, '_plus_')
    .replace(/-/g, '_dash_');
}

export function isValidEmailAddress(rawEmail: string): boolean {
  const email = normalizeEmail(rawEmail);
  if (email.length < BLUEPRINT_LIMITS.EMAIL_MIN || email.length > BLUEPRINT_LIMITS.EMAIL_MAX) {
    return false;
  }
  if (!EMAIL_PATTERN.test(email)) return false;
  const docId = emailToDocId(email);
  return (
    docId.length >= BLUEPRINT_LIMITS.DOC_ID_MIN &&
    docId.length <= BLUEPRINT_LIMITS.DOC_ID_MAX &&
    SAFE_DOC_ID_PATTERN.test(docId)
  );
}

export function isBootstrappedAdminIdentity(email?: string | null, emailVerified?: boolean | null): boolean {
  return Boolean(emailVerified === true && email && normalizeEmail(email) === MASTER_ADMIN_EMAIL);
}

export interface ProvisionUserInput {
  displayName: string;
  email: string;
  role: string;
  planTier: string;
  department?: string;
  notes?: string;
}

export interface SanitizedProvisionUser {
  emailKey: string;
  email: string;
  displayName: string;
  role: UserRole;
  planTier: PlanTier;
  department: string;
  notes: string;
}

export function validateProvisionUserInput(
  input: ProvisionUserInput
): { ok: true; data: SanitizedProvisionUser } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const displayName = String(input.displayName || '').trim();
  const email = normalizeEmail(input.email);
  const role = String(input.role || '').trim().toUpperCase() as UserRole;
  const planTier = String(input.planTier || '').trim().toUpperCase() as PlanTier;
  const department = String(input.department || '').trim();
  const notes = String(input.notes || '').trim();

  if (
    displayName.length < BLUEPRINT_LIMITS.DISPLAY_NAME_MIN ||
    displayName.length > BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
  ) {
    errors.push(`Full name must be between 1 and ${BLUEPRINT_LIMITS.DISPLAY_NAME_MAX} characters.`);
  }

  if (!isValidEmailAddress(email)) {
    errors.push('Enter a valid Google email address (safe Firestore ID up to 128 characters).');
  }

  if (!ALLOWED_USER_ROLES.includes(role)) {
    errors.push('Select a valid role: Trader, Analyst, or Admin.');
  }

  if (!ALLOWED_PLAN_TIERS.includes(planTier)) {
    errors.push('Select a valid plan tier: Pro, Institutional, or Admin Master.');
  }

  if (department.length > BLUEPRINT_LIMITS.DEPARTMENT_MAX) {
    errors.push(`Desk or department must be at most ${BLUEPRINT_LIMITS.DEPARTMENT_MAX} characters.`);
  }

  if (notes.length > BLUEPRINT_LIMITS.NOTES_MAX) {
    errors.push(`Notes must be at most ${BLUEPRINT_LIMITS.NOTES_MAX} characters.`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      emailKey: emailToDocId(email),
      email,
      displayName,
      role,
      planTier,
      department,
      notes,
    },
  };
}

export interface AccessRequestInput {
  displayName: string;
  requestedRole: string;
  reason: string;
}

export interface SanitizedAccessRequest {
  displayName: string;
  requestedRole: RequestableRole;
  reason: string;
}

export function validateAccessRequestInput(
  input: AccessRequestInput
): { ok: true; data: SanitizedAccessRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const displayName = String(input.displayName || '').trim();
  const requestedRole = String(input.requestedRole || '').trim().toUpperCase() as RequestableRole;
  const reason = String(input.reason || '').trim();

  if (
    displayName.length < BLUEPRINT_LIMITS.DISPLAY_NAME_MIN ||
    displayName.length > BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
  ) {
    errors.push(`Full name must be between 1 and ${BLUEPRINT_LIMITS.DISPLAY_NAME_MAX} characters.`);
  }

  if (!ALLOWED_REQUESTABLE_ROLES.includes(requestedRole)) {
    errors.push('Self-service requests are limited to Trader or Analyst roles.');
  }

  if (reason.length > BLUEPRINT_LIMITS.REASON_MAX) {
    errors.push(`Reason must be at most ${BLUEPRINT_LIMITS.REASON_MAX} characters.`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      displayName,
      requestedRole,
      reason,
    },
  };
}

export function computeAccessResolution(params: {
  uid?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  hasAdminRecord: boolean;
  authorizedUser: AuthorizedUserRecord | null;
  accessRequest: AccessRequestRecord | null;
}): {
  state: AccessResolutionState;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  canAccessTerminal: boolean;
} {
  const { uid, email, emailVerified, hasAdminRecord, authorizedUser, accessRequest } = params;

  if (!uid || !email) {
    return {
      state: 'UNAUTHENTICATED',
      isAdmin: false,
      isMasterAdmin: false,
      canAccessTerminal: false,
    };
  }

  if (emailVerified !== true) {
    return {
      state: 'UNVERIFIED_EMAIL',
      isAdmin: false,
      isMasterAdmin: false,
      canAccessTerminal: false,
    };
  }

  if (isBootstrappedAdminIdentity(email, emailVerified)) {
    return {
      state: 'MASTER_ADMIN',
      isAdmin: true,
      isMasterAdmin: true,
      canAccessTerminal: true,
    };
  }

  if (hasAdminRecord) {
    return {
      state: 'ADMIN',
      isAdmin: true,
      isMasterAdmin: false,
      canAccessTerminal: true,
    };
  }

  if (authorizedUser) {
    if (authorizedUser.status === 'ACTIVE') {
      return {
        state: 'AUTHORIZED_MEMBER',
        isAdmin: authorizedUser.role === 'ADMIN',
        isMasterAdmin: false,
        canAccessTerminal: true,
      };
    }
    if (authorizedUser.status === 'SUSPENDED') {
      return {
        state: 'SUSPENDED',
        isAdmin: false,
        isMasterAdmin: false,
        canAccessTerminal: false,
      };
    }
    return {
      state: 'REVOKED',
      isAdmin: false,
      isMasterAdmin: false,
      canAccessTerminal: false,
    };
  }

  if (accessRequest) {
    if (accessRequest.status === 'PENDING') {
      return {
        state: 'PENDING_APPROVAL',
        isAdmin: false,
        isMasterAdmin: false,
        canAccessTerminal: false,
      };
    }
    if (accessRequest.status === 'REJECTED') {
      return {
        state: 'REJECTED',
        isAdmin: false,
        isMasterAdmin: false,
        canAccessTerminal: false,
      };
    }
  }

  return {
    state: 'NOT_AUTHORIZED',
    isAdmin: false,
    isMasterAdmin: false,
    canAccessTerminal: false,
  };
}

export function generateAuditLogId(action: AdminAuditAction): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  const cleanAction = action.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return `audit_${cleanAction}_${ts}_${rand}`.slice(0, BLUEPRINT_LIMITS.DOC_ID_MAX);
}

export interface SecurityRoadmapPhase {
  step: number;
  title: string;
  layer: string;
  status: 'ENFORCED' | 'ACTIVE' | 'RECOMMENDED';
  summary: string;
  controls: string[];
}

export const SECURITY_ROADMAP_PHASES: SecurityRoadmapPhase[] = [
  {
    step: 1,
    title: 'Verified Identity & OAuth Authentication',
    layer: 'Identity Layer',
    status: 'ENFORCED',
    summary:
      'Replace unverified email/password forms with cryptographically verified Google Identity via Firebase Auth popup flow and mandatory email_verified enforcement.',
    controls: [
      'Firebase Auth signInWithPopup with verified Google tokens only',
      'Unverified accounts blocked unconditionally in both UI and Firestore Rules',
      'Master Admin bootstrapped strictly to the verified primary administrator identity',
    ],
  },
  {
    step: 2,
    title: 'Admin-Only Sign-Up & Invite Allowlist Gate',
    layer: 'Provisioning Layer',
    status: 'ENFORCED',
    summary:
      'Eliminate public self-registration. New users can only submit a non-escalatable access request; only verified Administrators can provision or activate accounts.',
    controls: [
      'Public /users/{uid} self-creation denied unless /authorizedUsers/{emailKey} is ACTIVE',
      'Access requests locked to status PENDING and non-admin roles (TRADER / ANALYST)',
      'Instant suspension or revocation immediately blocks profile writes and terminal entry',
    ],
  },
  {
    step: 3,
    title: 'Eight-Pillar Zero-Trust Firestore Security Rules',
    layer: 'Database Layer',
    status: 'ENFORCED',
    summary:
      'Database rules enforce schema integrity, zero-enumeration PII isolation, immutable timestamps, and anti-update-gap guards even if the client is bypassed.',
    controls: [
      'Default-deny catch-all rule + strict keys().hasAll / keys().hasOnly on every entity',
      'Zero-enumeration emailToDocId lookup prevents probing other users in /authorizedUsers',
      'Server-time equality (request.time) and immutable uid/createdAt/email invariants',
    ],
  },
  {
    step: 4,
    title: 'Server-Side Bearer Verification & RBAC Middleware',
    layer: 'API Layer',
    status: 'ENFORCED',
    summary:
      'Protected Express API routes verify Firebase ID tokens cryptographically on the server and enforce verified admin checks before returning privileged metadata.',
    controls: [
      'Bearer ID token verified via Firebase Admin verifyIdToken() on every protected route',
      'requireVerifiedAdmin middleware validates verified Master Admin email server-side',
      'HTTP hardening headers (X-Content-Type-Options, Referrer-Policy, Permissions-Policy)',
    ],
  },
  {
    step: 5,
    title: 'Immutable Security Audit Trail & Atomic Batches',
    layer: 'Governance Layer',
    status: 'ENFORCED',
    summary:
      'Every admin provisioning, approval, rejection, role change, suspension, or revocation executes in an atomic batch paired with a tamper-proof audit entry.',
    controls: [
      'Append-only /adminAuditLogs collection (allow update, delete: if false)',
      'Atomic writeBatch pairs request approval, allowlist activation, and audit record',
      'Full actor attribution (actorUid, actorEmail, action, targetEmail, server timestamp)',
    ],
  },
  {
    step: 6,
    title: 'Ongoing Operational Hardening Checklist',
    layer: 'Operations Layer',
    status: 'RECOMMENDED',
    summary:
      'Routine operational hygiene recommended before onboarding external trading desks or sharing production access broadly.',
    controls: [
      'Review Firestore Security Rules and authorized user roster weekly',
      'Enable Google Workspace 2-Step Verification (Hardware Key / Passkey) on Admin account',
      'Rotate Upstox API tokens daily and keep broker secrets strictly in server environment variables',
    ],
  },
];
