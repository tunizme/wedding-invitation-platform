import { canonicalJson } from '../document/validation-helpers';
import type { EditorDocument } from '../document/editor-document';
import { validateEditorDocument } from '../document/editor-document';
import type { WeddingData } from '../document/types';
import { validateWeddingData } from '../../invitations/wedding-data.schema';
import type { OperationScope } from '../../identity-access/session/operation-scope';
import { sessionStore } from '../../identity-access/session/store';

export type Backup = {
  key: string;
  owner: string;
  templateId: string;
  baseVersion: number;
  document: EditorDocument;
  sampleData: WeddingData;
  savedAt: number;
  expiresAt: number;
};
export function eligibleBackup(
  value: unknown,
  owner: string,
  templateId: string,
  now = Date.now(),
): Backup | null {
  if (!value || typeof value !== 'object') return null;
  const backup = value as Backup;
  if (
    backup.key !== `${owner}:${templateId}` ||
    backup.owner !== owner ||
    backup.templateId !== templateId ||
    !Number.isInteger(backup.baseVersion) ||
    backup.baseVersion < 1 ||
    !Number.isFinite(backup.savedAt) ||
    backup.savedAt > now ||
    !Number.isFinite(backup.expiresAt) ||
    backup.expiresAt <= now ||
    backup.expiresAt > backup.savedAt + 86400000 ||
    !validateEditorDocument(backup.document).valid ||
    !validateWeddingData(backup.sampleData).valid
  )
    return null;
  return backup;
}
let purgeEpoch = 0;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      'invitation-draft-backups-editor-document',
      1,
    );
    request.onupgradeneeded = () =>
      request.result.createObjectStore('drafts', { keyPath: 'key' });
    let expired = false;
    const timeout = setTimeout(() => {
      expired = true;
      reject(new Error('Kho khôi phục đang bị khóa.'));
    }, 5000);
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (expired) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Không có bản khôi phục cục bộ.'));
    };
    request.onblocked = () => {
      expired = true;
      clearTimeout(timeout);
      reject(new Error('Kho khôi phục đang bị khóa.'));
    };
  });
}
export async function saveBackup(
  value: Omit<Backup, 'key' | 'savedAt' | 'expiresAt'>,
  scope: OperationScope,
) {
  const epoch = purgeEpoch,
    savedAt = Date.now(),
    db = await open();
  try {
    scope.assertActive();
    if (epoch !== purgeEpoch) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const detach = scope.onDispose(() => {
        try {
          tx.abort();
        } catch (error) {
          // A completed transaction can precede its queued completion event.
          if (!(
            error instanceof DOMException && error.name === 'InvalidStateError'
          ))
            throw error;
        }
      });
      tx.objectStore('drafts').put({
        ...value,
        key: `${value.owner}:${value.templateId}`,
        savedAt,
        expiresAt: savedAt + 86400000,
      });
      tx.oncomplete = () => {
        detach();
        resolve();
      };
      tx.onerror = tx.onabort = () => {
        detach();
        reject(new Error('Không lưu được bản khôi phục.'));
      };
    });
  } finally {
    db.close();
  }
}
export async function loadBackup(
  owner: string,
  templateId: string,
  scope: OperationScope,
): Promise<Backup | null> {
  const db = await open();
  try {
    scope.assertActive();
    const value = await new Promise<Backup | undefined>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly'),
        request = tx.objectStore('drafts').get(`${owner}:${templateId}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error('Không đọc được bản khôi phục.'));
    });
    scope.assertActive();
    return eligibleBackup(value, owner, templateId);
  } finally {
    db.close();
  }
}
export function backupWasAcknowledged(
  value: Backup,
  stamp: string,
  checkpoint?: { baseVersion: number; savedBefore: number },
) {
  return (
    canonicalJson([value.document, value.sampleData]) === stamp ||
    Boolean(
      checkpoint &&
      value.baseVersion <= checkpoint.baseVersion &&
      value.savedAt < checkpoint.savedBefore,
    )
  );
}
export async function removeBackup(
  owner: string,
  templateId: string,
  savedStamp?: string,
  checkpoint?: { baseVersion: number; savedBefore: number },
) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const request = store.get(`${owner}:${templateId}`);
      request.onsuccess = () => {
        const value = request.result as Backup | undefined;
        if (
          !savedStamp ||
          (value && backupWasAcknowledged(value, savedStamp, checkpoint))
        )
          store.delete(`${owner}:${templateId}`);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Không xóa được bản khôi phục.'));
    });
  } finally {
    db.close();
  }
}
export async function purgeBackups() {
  purgeEpoch++;
  if (typeof indexedDB === 'undefined') return;
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Không xóa được bản khôi phục.'));
    });
  } finally {
    db.close();
  }
}
let installed = false;
export function installRecoveryLifecycle() {
  if (installed) return;
  installed = true;
  let owner = sessionStore.get()?.user.id;
  sessionStore.subscribe(() => {
    const next = sessionStore.get()?.user.id;
    if (owner && owner !== next) void purgeBackups().catch(() => {});
    owner = next;
  });
}
