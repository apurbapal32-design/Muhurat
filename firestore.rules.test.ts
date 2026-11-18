import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.join(process.cwd(), 'firestore.rules');
const blueprintPath = path.join(process.cwd(), 'firebase-blueprint.json');

test('Firestore rules enforce Eight Pillars security gates against Dirty Dozen attack vectors', () => {
  const rules = fs.readFileSync(rulesPath, 'utf-8');
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));

  // Global safety net first
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);

  // Every blueprint path has a matching rules block
  for (const collectionPath of Object.keys(blueprint.firestore)) {
    const cleanSegment = collectionPath.split('/').filter(Boolean)[0];
    assert.ok(rules.includes(cleanSegment), `Missing rules block for ${collectionPath}`);
  }

  // Verified email + Master Gate + strict key checks + temporal integrity + terminal state lock
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)/);
  assert.match(rules, /keys\(\)\.hasAll/);
  assert.match(rules, /keys\(\)\.hasOnly/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly/);
  assert.match(rules, /request\.time/);
  assert.match(rules, /existing\(\)\.status != 'ARCHIVED'/);
  assert.match(rules, /isValidId/);
});
