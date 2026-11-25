import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  AccessRequestInput,
  AccessRequestRecord,
  AdminAuditAction,
  AdminAuditLogRecord,
  AuthorizedStatus,
  AuthorizedUserRecord,
  BLUEPRINT_LIMITS,
  computeAccessResolution,
  emailToDocId,
  generateAuditLogId,
  isBootstrappedAdminIdentity,
  normalizeEmail,
  PlanTier,
  ProvisionUserInput,
  UserRole,
  validateAccessRequestInput,
  validateProvisionUserInput,
} from '../utils/adminAuthSecurity';

export interface ResolvedAccessSnapshot {
  state: ReturnType<typeof computeAccessResolution>['state'];
  isAdmin: boolean;
  isMasterAdmin: boolean;
  canAccessTerminal: boolean;
  authorizedUser: AuthorizedUserRecord | null;
  accessRequest: AccessRequestRecord | null;
}

/**
 * Evaluates a signed-in user's authorization status strictly against Firestore RBAC rules.
 * Never lists or probes any other user's documents (zero-enumeration).
 */
export async function resolveUserAccessFromFirestore(user: User): Promise<ResolvedAccessSnapshot> {
  const email = normalizeEmail(user.email || '');
  const isVerified = user.emailVerified === true;

  if (!email || !isVerified) {
    return {
      ...computeAccessResolution({
        uid: user.uid,
        email,
        emailVerified: isVerified,
        hasAdminRecord: false,
        authorizedUser: null,
        accessRequest: null,
      }),
      authorizedUser: null,
      accessRequest: null,
    };
  }

  let hasAdminRecord = false;
  let authorizedUser: AuthorizedUserRecord | null = null;
  let accessRequest: AccessRequestRecord | null = null;

  // 1. Check own /admins/{uid} record
  const adminPath = `admins/${user.uid}`;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    hasAdminRecord = adminSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, adminPath);
  }

  // 2. Check own /authorizedUsers/{emailKey} record (strictly self-scoped)
  const emailKey = emailToDocId(email);
  const authUserPath = `authorizedUsers/${emailKey}`;
  try {
    const authSnap = await getDoc(doc(db, 'authorizedUsers', emailKey));
    if (authSnap.exists()) {
      authorizedUser = authSnap.data() as AuthorizedUserRecord;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, authUserPath);
  }

  // 3. If not yet authorized/admin, check own /accessRequests/{uid} status
  const isMaster = isBootstrappedAdminIdentity(email, isVerified);
  if (!isMaster && !hasAdminRecord && (!authorizedUser || authorizedUser.status !== 'ACTIVE')) {
    const reqPath = `accessRequests/${user.uid}`;
    try {
      const reqSnap = await getDoc(doc(db, 'accessRequests', user.uid));
      if (reqSnap.exists()) {
        accessRequest = reqSnap.data() as AccessRequestRecord;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, reqPath);
    }
  }

  const resolution = computeAccessResolution({
    uid: user.uid,
    email,
    emailVerified: isVerified,
    hasAdminRecord,
    authorizedUser,
    accessRequest,
  });

  // 4. Auto-sync private /users/{uid} ONLY when authorized or admin (Firestore rules enforce this too)
  if (resolution.canAccessTerminal) {
    const userDocPath = `users/${user.uid}`;
    try {
      const userRef = doc(db, 'users', user.uid);
      const existingProfile = await getDoc(userRef);
      const cleanName = (user.displayName || email.split('@')[0] || 'Trader')
        .trim()
        .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);
      if (!existingProfile.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email,
          displayName: cleanName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, userDocPath);
    }
  }

  return {
    ...resolution,
    authorizedUser,
    accessRequest,
  };
}

/**
 * Allows an authenticated, verified, non-authorized user to submit a PENDING request
 * for Administrator approval (cannot self-approve or request ADMIN role).
 */
export async function submitUserAccessRequest(
  user: User,
  input: AccessRequestInput
): Promise<void> {
  const email = normalizeEmail(user.email || '');
  if (!email || !user.emailVerified) {
    throw new Error('A verified Google account is required to submit an access request.');
  }

  const validation = validateAccessRequestInput(input);
  if ('errors' in validation) {
    throw new Error(validation.errors[0]);
  }

  const reqPath = `accessRequests/${user.uid}`;
  try {
    await setDoc(doc(db, 'accessRequests', user.uid), {
      uid: user.uid,
      email,
      displayName: validation.data.displayName,
      requestedRole: validation.data.requestedRole,
      reason: validation.data.reason,
      status: 'PENDING',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, reqPath);
  }
}

/**
 * Admin-Only Sign-Up: Provisions and authorizes a new user account in Firestore
 * paired atomically with an immutable audit log entry.
 */
export async function adminProvisionUser(
  adminUser: User,
  input: ProvisionUserInput
): Promise<{ email: string; emailKey: string }> {
  const adminEmail = normalizeEmail(adminUser.email || '');
  const validation = validateProvisionUserInput(input);
  if ('errors' in validation) {
    throw new Error(validation.errors[0]);
  }

  const { emailKey, email, displayName, role, planTier, department, notes } = validation.data;
  const authRef = doc(db, 'authorizedUsers', emailKey);
  const logId = generateAuditLogId('PROVISION_USER');
  const logRef = doc(db, 'adminAuditLogs', logId);

  const payload: Record<string, unknown> = {
    emailKey,
    email,
    displayName,
    role,
    planTier,
    status: 'ACTIVE',
    provisionedBy: adminEmail,
    provisionedByUid: adminUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (department) payload.department = department;
  if (notes) payload.notes = notes;

  const batch = writeBatch(db);
  batch.set(authRef, payload);
  batch.set(logRef, {
    actorUid: adminUser.uid,
    actorEmail: adminEmail,
    action: 'PROVISION_USER' satisfies AdminAuditAction,
    targetEmail: email,
    detail: `Authorized ${displayName} (${role} · ${planTier}) via Admin-Only Sign-Up`.slice(
      0,
      BLUEPRINT_LIMITS.DETAIL_MAX
    ),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return { email, emailKey };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `authorizedUsers/${emailKey}`);
  }
}

/**
 * Atomically approves a pending AccessRequest, creates/activates the user's
 * allowlist record in /authorizedUsers, and logs the immutable audit event.
 */
export async function adminApproveAccessRequest(
  adminUser: User,
  requestRecord: AccessRequestRecord,
  assignedRole: UserRole,
  planTier: PlanTier,
  reviewNote = ''
): Promise<void> {
  const adminEmail = normalizeEmail(adminUser.email || '');
  const email = normalizeEmail(requestRecord.email);
  const emailKey = emailToDocId(email);
  const cleanNote = reviewNote.trim().slice(0, BLUEPRINT_LIMITS.REVIEW_NOTE_MAX);

  const reqRef = doc(db, 'accessRequests', requestRecord.uid);
  const authRef = doc(db, 'authorizedUsers', emailKey);
  const logId = generateAuditLogId('APPROVE_REQUEST');
  const logRef = doc(db, 'adminAuditLogs', logId);

  const batch = writeBatch(db);
  batch.update(reqRef, {
    status: 'APPROVED',
    reviewedBy: adminEmail,
    reviewNote: cleanNote || 'Approved by Administrator',
    updatedAt: serverTimestamp(),
  });

  const authPayload: Record<string, unknown> = {
    emailKey,
    email,
    displayName: requestRecord.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
    role: assignedRole,
    planTier,
    status: 'ACTIVE',
    provisionedBy: adminEmail,
    provisionedByUid: adminUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (cleanNote) authPayload.notes = cleanNote;

  batch.set(authRef, authPayload);
  batch.set(logRef, {
    actorUid: adminUser.uid,
    actorEmail: adminEmail,
    action: 'APPROVE_REQUEST' satisfies AdminAuditAction,
    targetEmail: email,
    detail: `Approved access request for ${requestRecord.displayName} as ${assignedRole} (${planTier})`.slice(
      0,
      BLUEPRINT_LIMITS.DETAIL_MAX
    ),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `accessRequests/${requestRecord.uid}`);
  }
}

export async function adminRejectAccessRequest(
  adminUser: User,
  requestRecord: AccessRequestRecord,
  reviewNote = ''
): Promise<void> {
  const adminEmail = normalizeEmail(adminUser.email || '');
  const email = normalizeEmail(requestRecord.email);
  const cleanNote = reviewNote.trim().slice(0, BLUEPRINT_LIMITS.REVIEW_NOTE_MAX) || 'Declined by Administrator';

  const reqRef = doc(db, 'accessRequests', requestRecord.uid);
  const logId = generateAuditLogId('REJECT_REQUEST');
  const logRef = doc(db, 'adminAuditLogs', logId);

  const batch = writeBatch(db);
  batch.update(reqRef, {
    status: 'REJECTED',
    reviewedBy: adminEmail,
    reviewNote: cleanNote,
    updatedAt: serverTimestamp(),
  });
  batch.set(logRef, {
    actorUid: adminUser.uid,
    actorEmail: adminEmail,
    action: 'REJECT_REQUEST' satisfies AdminAuditAction,
    targetEmail: email,
    detail: `Declined access request for ${requestRecord.displayName}: ${cleanNote}`.slice(
      0,
      BLUEPRINT_LIMITS.DETAIL_MAX
    ),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `accessRequests/${requestRecord.uid}`);
  }
}

export async function adminUpdateAuthorizedUser(
  adminUser: User,
  target: AuthorizedUserRecord,
  updates: { role?: UserRole; planTier?: PlanTier; status?: AuthorizedStatus }
): Promise<void> {
  const adminEmail = normalizeEmail(adminUser.email || '');
  const authRef = doc(db, 'authorizedUsers', target.emailKey);

  let action: AdminAuditAction = 'UPDATE_ROLE';
  let detail = `Updated permissions for ${target.displayName}`;
  if (updates.status === 'SUSPENDED') {
    action = 'SUSPEND_USER';
    detail = `Suspended access for ${target.displayName} (${target.email})`;
  } else if (updates.status === 'ACTIVE' && target.status !== 'ACTIVE') {
    action = 'REACTIVATE_USER';
    detail = `Reactivated access for ${target.displayName} (${target.email})`;
  } else if (updates.status === 'REVOKED') {
    action = 'REVOKE_USER';
    detail = `Revoked access for ${target.displayName} (${target.email})`;
  } else if (updates.role) {
    action = 'UPDATE_ROLE';
    detail = `Changed role for ${target.displayName} to ${updates.role}${updates.planTier ? ` (${updates.planTier})` : ''}`;
  }

  const logId = generateAuditLogId(action);
  const logRef = doc(db, 'adminAuditLogs', logId);

  const batch = writeBatch(db);
  batch.update(authRef, {
    ...(updates.role ? { role: updates.role } : {}),
    ...(updates.planTier ? { planTier: updates.planTier } : {}),
    ...(updates.status ? { status: updates.status } : {}),
    updatedAt: serverTimestamp(),
  });
  batch.set(logRef, {
    actorUid: adminUser.uid,
    actorEmail: adminEmail,
    action,
    targetEmail: target.email,
    detail: detail.slice(0, BLUEPRINT_LIMITS.DETAIL_MAX),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `authorizedUsers/${target.emailKey}`);
  }
}

export async function adminDeleteAuthorizedUser(
  adminUser: User,
  target: AuthorizedUserRecord
): Promise<void> {
  const adminEmail = normalizeEmail(adminUser.email || '');
  const authRef = doc(db, 'authorizedUsers', target.emailKey);
  const logId = generateAuditLogId('REVOKE_USER');
  const logRef = doc(db, 'adminAuditLogs', logId);

  const batch = writeBatch(db);
  batch.delete(authRef);
  batch.set(logRef, {
    actorUid: adminUser.uid,
    actorEmail: adminEmail,
    action: 'REVOKE_USER' satisfies AdminAuditAction,
    targetEmail: target.email,
    detail: `Permanently removed ${target.displayName} from authorized allowlist`.slice(
      0,
      BLUEPRINT_LIMITS.DETAIL_MAX
    ),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `authorizedUsers/${target.emailKey}`);
  }
}

/**
 * Subscribes to Admin Console collections ONLY after verifying Master Admin identity.
 */
export function subscribeMasterAdminData(callbacks: {
  onAuthorizedUsers: (rows: AuthorizedUserRecord[]) => void;
  onAccessRequests: (rows: AccessRequestRecord[]) => void;
  onAuditLogs: (rows: AdminAuditLogRecord[]) => void;
  onError?: (err: Error) => void;
}): Unsubscribe {
  const unsubs: Unsubscribe[] = [];

  const qAuth = query(collection(db, 'authorizedUsers'), orderBy('updatedAt', 'desc'), limit(200));
  unsubs.push(
    onSnapshot(
      qAuth,
      (snap) => {
        callbacks.onAuthorizedUsers(snap.docs.map((d) => d.data() as AuthorizedUserRecord));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'authorizedUsers');
        } catch (wrapped) {
          callbacks.onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    )
  );

  const qReq = query(collection(db, 'accessRequests'), orderBy('createdAt', 'desc'), limit(100));
  unsubs.push(
    onSnapshot(
      qReq,
      (snap) => {
        callbacks.onAccessRequests(snap.docs.map((d) => d.data() as AccessRequestRecord));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'accessRequests');
        } catch (wrapped) {
          callbacks.onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    )
  );

  const qLogs = query(collection(db, 'adminAuditLogs'), orderBy('createdAt', 'desc'), limit(100));
  unsubs.push(
    onSnapshot(
      qLogs,
      (snap) => {
        callbacks.onAuditLogs(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AdminAuditLogRecord, 'id'>),
          }))
        );
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'adminAuditLogs');
        } catch (wrapped) {
          callbacks.onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}
