import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAccessResolution,
  emailToDocId,
  isBootstrappedAdminIdentity,
  isValidEmailAddress,
  MASTER_ADMIN_EMAIL,
  SECURITY_ROADMAP_PHASES,
  validateAccessRequestInput,
  validateProvisionUserInput,
} from './adminAuthSecurity';

test('emailToDocId produces deterministic safe Firestore IDs matching security rules', () => {
  assert.equal(emailToDocId('ApurbaPal32@Gmail.com'), 'apurbapal32_at_gmail_dot_com');
  assert.equal(emailToDocId('desk_lead+nse-01@finurl.co.in'), 'desk__lead_plus_nse_dash_01_at_finurl_dot_co_dot_in');
  assert.equal(isValidEmailAddress('trader.alpha@company.com'), true);
  assert.equal(isValidEmailAddress('not-an-email'), false);
  assert.equal(isValidEmailAddress(`${'a'.repeat(130)}@example.com`), false);
});

test('validateProvisionUserInput enforces blueprint bounds and rejects invalid payloads', () => {
  const valid = validateProvisionUserInput({
    displayName: '  Rohan Deshmukh  ',
    email: 'Rohan.Desk@Example.COM',
    role: 'TRADER',
    planTier: 'INSTITUTIONAL',
    department: 'Nifty F&O Desk',
    notes: 'Approved after onboarding',
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.data.email, 'rohan.desk@example.com');
    assert.equal(valid.data.emailKey, 'rohan_dot_desk_at_example_dot_com');
    assert.equal(valid.data.displayName, 'Rohan Deshmukh');
  }

  const bad = validateProvisionUserInput({
    displayName: '',
    email: 'invalid-email',
    role: 'SUPERUSER',
    planTier: 'FREE_HACK',
    notes: 'x'.repeat(250),
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.ok(bad.errors.length >= 4);
  }
});

test('validateAccessRequestInput blocks ADMIN privilege escalation on self-service requests', () => {
  const escalationAttempt = validateAccessRequestInput({
    displayName: 'External User',
    requestedRole: 'ADMIN',
    reason: 'Grant me admin',
  });
  assert.equal(escalationAttempt.ok, false);

  const validRequest = validateAccessRequestInput({
    displayName: 'Neha Verma',
    requestedRole: 'ANALYST',
    reason: 'Institutional order flow desk member',
  });
  assert.equal(validRequest.ok, true);
});

test('computeAccessResolution blocks unverified admin email spoofing and enforces Admin-Only Sign-Up states', () => {
  // Email spoofing test: matching admin email with emailVerified=false MUST be rejected
  assert.equal(isBootstrappedAdminIdentity(MASTER_ADMIN_EMAIL, false), false);
  const spoofAttempt = computeAccessResolution({
    uid: 'uid-spoof',
    email: MASTER_ADMIN_EMAIL,
    emailVerified: false,
    hasAdminRecord: false,
    authorizedUser: null,
    accessRequest: null,
  });
  assert.equal(spoofAttempt.state, 'UNVERIFIED_EMAIL');
  assert.equal(spoofAttempt.isAdmin, false);
  assert.equal(spoofAttempt.canAccessTerminal, false);

  // Verified Master Admin
  const masterAdmin = computeAccessResolution({
    uid: 'uid-master',
    email: MASTER_ADMIN_EMAIL,
    emailVerified: true,
    hasAdminRecord: false,
    authorizedUser: null,
    accessRequest: null,
  });
  assert.equal(masterAdmin.state, 'MASTER_ADMIN');
  assert.equal(masterAdmin.isAdmin, true);
  assert.equal(masterAdmin.isMasterAdmin, true);
  assert.equal(masterAdmin.canAccessTerminal, true);

  // Uninvited verified user -> NOT_AUTHORIZED (Zero Self-Signup)
  const uninvited = computeAccessResolution({
    uid: 'uid-stranger',
    email: 'stranger@gmail.com',
    emailVerified: true,
    hasAdminRecord: false,
    authorizedUser: null,
    accessRequest: null,
  });
  assert.equal(uninvited.state, 'NOT_AUTHORIZED');
  assert.equal(uninvited.canAccessTerminal, false);

  // Pending access request -> PENDING_APPROVAL
  const pending = computeAccessResolution({
    uid: 'uid-stranger',
    email: 'stranger@gmail.com',
    emailVerified: true,
    hasAdminRecord: false,
    authorizedUser: null,
    accessRequest: {
      uid: 'uid-stranger',
      email: 'stranger@gmail.com',
      displayName: 'Stranger',
      requestedRole: 'TRADER',
      reason: 'Need access',
      status: 'PENDING',
    },
  });
  assert.equal(pending.state, 'PENDING_APPROVAL');
  assert.equal(pending.canAccessTerminal, false);

  // Admin-approved ACTIVE user -> AUTHORIZED_MEMBER
  const approved = computeAccessResolution({
    uid: 'uid-member',
    email: 'member@gmail.com',
    emailVerified: true,
    hasAdminRecord: false,
    authorizedUser: {
      emailKey: emailToDocId('member@gmail.com'),
      email: 'member@gmail.com',
      displayName: 'Member',
      role: 'TRADER',
      planTier: 'PRO',
      status: 'ACTIVE',
      provisionedBy: MASTER_ADMIN_EMAIL,
      provisionedByUid: 'uid-master',
    },
    accessRequest: null,
  });
  assert.equal(approved.state, 'AUTHORIZED_MEMBER');
  assert.equal(approved.isAdmin, false);
  assert.equal(approved.canAccessTerminal, true);

  // Suspended user -> SUSPENDED (immediate lockout)
  const suspended = computeAccessResolution({
    uid: 'uid-member',
    email: 'member@gmail.com',
    emailVerified: true,
    hasAdminRecord: false,
    authorizedUser: {
      emailKey: emailToDocId('member@gmail.com'),
      email: 'member@gmail.com',
      displayName: 'Member',
      role: 'TRADER',
      planTier: 'PRO',
      status: 'SUSPENDED',
      provisionedBy: MASTER_ADMIN_EMAIL,
      provisionedByUid: 'uid-master',
    },
    accessRequest: null,
  });
  assert.equal(suspended.state, 'SUSPENDED');
  assert.equal(suspended.canAccessTerminal, false);

  // Security Roadmap has all 6 structured phases
  assert.equal(SECURITY_ROADMAP_PHASES.length, 6);
});
