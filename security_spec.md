# Firestore Security Specification (Admin-Only Sign-Up & Zero-Trust RBAC)

## 1. Data Invariants
1. **Zero Self-Signup Enforcement**: Public self-registration is strictly disabled at the database rule layer. Creating `/users/{userId}` requires either `isAdmin()` OR an existing `ACTIVE` allowlist entry in `/authorizedUsers/{emailToDocId(request.auth.token.email)}`.
2. **Verified Identity Mandatory**: Every privileged read/write requires `request.auth != null && request.auth.token.email_verified == true`. Unverified email spoofing is blocked unconditionally.
3. **Admin-Only Provisioning**: Only verified administrators (`apurbapal32@gmail.com` or an existing UID in `/admins/{uid}`) may create, update, or revoke `/authorizedUsers/{emailKey}` documents, review `/accessRequests/{requestUid}`, or manage `/admins/{adminUid}`.
4. **Zero-Enumeration PII Isolation**:
   - Regular verified users may only `get` their own `/authorizedUsers/{emailKey}` where `emailKey == emailToDocId(request.auth.token.email)` and `resource.data.email == request.auth.token.email.lower()`. They can never list or probe other users' allowlist entries.
   - Regular verified users may only `get` their own `/accessRequests/{requestUid}` (`request.auth.uid == requestUid`) and `/users/{userId}` (`request.auth.uid == userId`).
5. **Non-Escalatable Access Requests**: A non-admin user creating `/accessRequests/{uid}` can only set `status == 'PENDING'`, `requestedRole in ['TRADER', 'ANALYST']` (never `'ADMIN'`), `uid == request.auth.uid`, `email == request.auth.token.email.lower()`, and cannot attach `reviewedBy` or `reviewNote`. Users cannot update or delete their access request after submission.
6. **Immutable Audit Trail**: `/adminAuditLogs/{logId}` is append-only (`allow create: if isAdmin()`; `allow update, delete: if false;`), preventing even administrators from tampering with historical security logs.
7. **Master Gate & Temporal Integrity**: All user subcollections (`/watchlists`, `/alerts`, `/scanConfigs`) enforce parent `/users/{userId}` existence, strict `.size()` bounds on every string, `isValidId()` regex (`^[a-zA-Z0-9_\-]+$`, max 128 chars), strict `keys().hasAll` + `keys().hasOnly`, `affectedKeys().hasOnly` on every update, server-timestamp equality (`request.time`), immutable `createdAt`/`uid`, and terminal lock on `ARCHIVED` alerts.

## 2. Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Self-Signup Bypass**: Verified non-admin user without an `ACTIVE` `/authorizedUsers` entry attempting `create` on `/users/{uid}`.
2. **Allowlist Forgery**: Non-admin user attempting `create` on `/authorizedUsers/{emailKey}` to self-authorize with `role: 'ADMIN'`.
3. **Self-Approval Escalation**: Non-admin user creating `/accessRequests/{uid}` with `status: 'APPROVED'` or `requestedRole: 'ADMIN'`.
4. **Access Request Mutation**: Non-admin user updating their own `/accessRequests/{uid}` from `PENDING` to `APPROVED`.
5. **Admin Privilege Injection**: Non-admin user attempting `create` on `/admins/{uid}` to grant themselves admin rights.
6. **Email Spoofing Attack**: Attacker with `email: 'apurbapal32@gmail.com'` but `email_verified: false` attempting any admin read/write.
7. **Allowlist Enumeration / PII Leak**: Authenticated regular user attempting `list` on `/authorizedUsers` or `get` on another user's `/authorizedUsers/{otherEmailKey}`.
8. **Audit Log Tampering**: Even a verified admin attempting `update` or `delete` on `/adminAuditLogs/{logId}`.
9. **Shadow Field Injection**: Creating `/authorizedUsers/{emailKey}` or `/users/{uid}` with an undeclared ghost field (`superAdmin: true`).
10. **ID Poisoning & Resource Exhaustion**: Attempting `create` with a 1,500-character document ID or `reason` exceeding 240 characters.
11. **Temporal Forgery**: Submitting a client-forged `createdAt` or `updatedAt` timestamp not equal to `request.time`.
12. **Terminal State / Value Poisoning**: Setting `triggerPrice: "100"` (wrong type) or modifying an `ARCHIVED` `TradeAlert`, or creating an orphaned subcollection without `/users/{userId}`.
