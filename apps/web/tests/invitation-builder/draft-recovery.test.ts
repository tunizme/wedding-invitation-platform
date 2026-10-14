import { canonicalJson } from '../../src/features/invitation-builder/document/validation-helpers';
import { describe, it, expect } from 'vitest';
import { createBlankDocument } from '../../src/features/invitation-builder/document/editor-document';
import {
  eligibleBackup,
  backupWasAcknowledged,
} from '../../src/features/invitation-builder/editor/draft-recovery';
describe('recovery admission boundaries', () => {
  const now = 100000000;
  const backup = {
    key: 'owner:template',
    owner: 'owner',
    templateId: 'template',
    baseVersion: 3,
    document: createBlankDocument(),
    sampleData: { schemaVersion: 1 as const },
    savedAt: now,
    expiresAt: now + 86400000,
  };
  it('admits only the same account and template', () => {
    expect(eligibleBackup(backup, 'owner', 'template', now)).toEqual(backup);
    expect(eligibleBackup(backup, 'other', 'template', now)).toBeNull();
    expect(eligibleBackup(backup, 'owner', 'other', now)).toBeNull();
    expect(
      eligibleBackup(
        { ...backup, key: 'other:template' },
        'owner',
        'template',
        now,
      ),
    ).toBeNull();
  });
  it('expires exactly at 24 hours and rejects tampered expiry and future clocks', () => {
    expect(
      eligibleBackup(backup, 'owner', 'template', now + 86399999),
    ).not.toBeNull();
    expect(
      eligibleBackup(backup, 'owner', 'template', now + 86400000),
    ).toBeNull();
    expect(
      eligibleBackup(
        { ...backup, expiresAt: now + 86400001 },
        'owner',
        'template',
        now,
      ),
    ).toBeNull();
    expect(eligibleBackup(backup, 'owner', 'template', now - 1)).toBeNull();
  });
  it('clears older acknowledged edits but keeps a newer backup from an in-flight save', () => {
    const stamp = canonicalJson([backup.document, backup.sampleData]);
    const changed = {
      ...backup,
      document: {
        ...backup.document,
        settings: { ...backup.document.settings, title: 'New local edit' },
      },
    };
    const checkpoint = { baseVersion: 3, savedBefore: now + 1 };
    expect(backupWasAcknowledged(backup, stamp)).toBe(true);
    const reordered = {
      ...backup,
      document: Object.fromEntries(
        Object.entries(backup.document).reverse(),
      ) as typeof backup.document,
    };
    expect(backupWasAcknowledged(reordered, stamp)).toBe(true);

    expect(backupWasAcknowledged(changed, stamp, checkpoint)).toBe(true);
    expect(
      backupWasAcknowledged(
        { ...changed, savedAt: now + 2 },
        stamp,
        checkpoint,
      ),
    ).toBe(false);
    expect(
      backupWasAcknowledged({ ...changed, baseVersion: 4 }, stamp, checkpoint),
    ).toBe(false);
    expect(
      backupWasAcknowledged(
        { ...changed, savedAt: checkpoint.savedBefore },
        stamp,
        checkpoint,
      ),
    ).toBe(false);
  });
  it('rejects corrupted revisions and unsupported designs', () => {
    expect(
      eligibleBackup({ ...backup, baseVersion: 0 }, 'owner', 'template', now),
    ).toBeNull();
    expect(
      eligibleBackup(
        { ...backup, document: { schemaVersion: 2 } },
        'owner',
        'template',
        now,
      ),
    ).toBeNull();
    expect(
      eligibleBackup(
        { ...backup, sampleData: { schemaVersion: 99 } },
        'owner',
        'template',
        now,
      ),
    ).toBeNull();
  });
});
