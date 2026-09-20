import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const { prepareProfiles } = createRequire(import.meta.url)(
  '../deploy/prepare-browser-profiles.cjs',
);
test('Container startup removes stale locks in every browser slot and preserves profile data', () => {
  const root = mkdtempSync(join(tmpdir(), 'rent-profiles-'));
  try {
    for (const dir of ['browser-profile', 'browser-profile-1', 'unrelated']) {
      mkdirSync(join(root, dir));
      symlinkSync('old-container-1806', join(root, dir, 'SingletonLock'));
      symlinkSync('/tmp/old-socket', join(root, dir, 'SingletonSocket'));
      writeFileSync(join(root, dir, 'Cookies'), 'preserve');
    }
    prepareProfiles(root);
    prepareProfiles(root);
    assert.deepEqual(readdirSync(join(root, 'browser-profile')), ['Cookies']);
    assert.deepEqual(readdirSync(join(root, 'browser-profile-1')), ['Cookies']);
    assert.ok(readdirSync(join(root, 'unrelated')).includes('SingletonLock'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
