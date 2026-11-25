import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.join(process.cwd(), 'firestore.rules');
const blueprintPath = path.join(process.cwd(), 'firebase-blueprint.json');

test('Firestore rules enforce Eight Pillars + Admin-Only Sign-Up + Zero-Trust RBAC against Dirty Dozen attack vectors', () => {
  const rules = fs.readFileSync(rulesPath, 'utf-8');
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));

  // 1. Global safety net first
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);

  // 2. Every blueprint collection path has a matching rules block
  for (const collectionPath of Object.keys(blueprint.firestore)) {
    const cleanSegment = collectionPath.split('/').filter(Boolean)[0];
    assert.ok(rules.includes(`match /${cleanSegment}/`), `Missing rules block for ${collectionPath}`);
  }

  // 3. Verified email mandatory + bootstrapped admin email verified check
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /apurbapal32@gmail\.com/);

  // 4. Zero self-signup gate: creating /users/{userId} requires isAdmin() or isAuthorizedActiveEmail()
  assert.match(rules, /isAuthorizedActiveEmail\(\)/);
  assert.match(rules, /status == 'ACTIVE'/);

  // 5. Non-escalatable access requests: users can only submit PENDING and never ADMIN
  assert.match(rules, /incoming\(\)\.status == 'PENDING'/);
  assert.match(rules, /data\.requestedRole in \['TRADER', 'ANALYST'\]/);
  assert.match(rules, /!\('reviewedBy' in incoming\(\)\)/);

  // 6. Immutable audit logs: update and delete strictly false
  assert.match(rules, /match \/adminAuditLogs\/\{logId\}[\s\S]*allow update: if false;[\s\S]*allow delete: if false;/);

  // 7. Eight-pillar mechanics: Master Gate, strict keys, affectedKeys, request.time, terminal lock, ID validation
  assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)/);
  assert.match(rules, /keys\(\)\.hasAll/);
  assert.match(rules, /keys\(\)\.hasOnly/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly/);
  assert.match(rules, /request\.time/);
  assert.match(rules, /existing\(\)\.status != 'ARCHIVED'/);
  assert.match(rules, /isValidId/);
});
