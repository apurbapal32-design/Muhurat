# Firestore Security Specification

## 1. Data Invariants
1. Every document under `/users/{userId}` and its subcollections (`/watchlists/{itemId}`, `/alerts/{alertId}`, `/scanConfigs/{configId}`) must belong exclusively to `request.auth.uid == userId` and have `request.auth.token.email_verified == true` for writes.
2. Parent existence (`exists(/databases/$(database)/documents/users/$(userId))`) is enforced on subcollection creation (Master Gate).
3. `uid` and `createdAt` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.
4. All string fields enforce strict `.size()` bounds; all document IDs enforce `^[a-zA-Z0-9_\\-]+$` and length `<= 128`.
5. Terminal alert state (`status == 'ARCHIVED'`) cannot transition back or be mutated.
6. No PII (`email`) is readable by any non-owner (`allow read` requires `isOwner(userId)`).

## 2. Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read of `/users/userA`.
2. Non-owner read of `/users/userA` (PII email leak attempt).
3. Unverified email (`email_verified: false`) attempting write to `/users/userA`.
4. Identity spoofing: userB creating `/users/userA/watchlists/RELIANCE` with `uid: 'userB'` or `uid: 'userA'`.
5. Shadow field injection: creating `/users/userA` with extra `isAdmin: true` ghost field.
6. Oversized document ID (`1500` chars) on `/users/userA/watchlists/{longId}`.
7. Oversized `notes` string (`> 300` chars) on `WatchlistItem`.
8. Client-forged `createdAt` timestamp not equal to `request.time`.
9. Mutating immutable `createdAt` or `uid` during update.
10. Value poisoning: setting `triggerPrice: "100"` (string instead of number) on `TradeAlert`.
11. State transition after terminal lock: updating an `ARCHIVED` `TradeAlert`.
12. Orphaned subcollection creation when `/users/{userId}` parent document does not exist.
