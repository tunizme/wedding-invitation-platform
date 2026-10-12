import type { AccessSession } from '../api/client';
import type { EndAdmissionReason } from './auth-selector';

type Listener = () => void;
type EndListener = (reason: EndAdmissionReason) => void;

/** 006: which context/session the in-memory private session belongs to. */
export interface Admission {
  contextId: string;
  sessionTag: string;
  contextRevision: number;
}

let version = 0;
let identityEpoch = 0;
const identity = (session: AccessSession | null, owner: Admission | null) =>
  session
    ? JSON.stringify([
        session.user.id,
        session.user.role,
        session.user.status,
        owner?.contextId ?? null,
        owner?.sessionTag ?? session.sessionTag ?? null,
      ])
    : null;
let current: AccessSession | null = null;
let admission: Admission | null = null;
let lastEnd: EndAdmissionReason | null = null;
const listeners = new Set<Listener>();
const endListeners = new Set<EndListener>();

function notify() {
  for (const listener of listeners) listener();
}

export const sessionStore = {
  get: () => current,
  version: () => version,
  identityEpoch: () => identityEpoch,
  admission: () => admission,
  /** Reason the last private admission ended, for recovery UI (FR-006). */
  lastEndReason: () => lastEnd,
  set(session: AccessSession, next?: Admission) {
    if (identity(current, admission) !== identity(session, next ?? admission))
      identityEpoch++;
    version++;
    current = session;
    admission = next ?? admission;
    lastEnd = null;
    notify();
  },
  clear(reason: EndAdmissionReason = 'LOGOUT') {
    if (current !== null || admission !== null) identityEpoch++;
    version++;
    const had = current !== null || admission !== null;
    current = null;
    admission = null;
    lastEnd = reason;
    notify();
    if (had) for (const listener of endListeners) listener(reason);
  },
  /** End only the session that initiated an asynchronous operation. */
  clearIf(
    expected: AccessSession | null,
    reason: EndAdmissionReason = 'LOGOUT',
  ): boolean {
    if (!current || !expected) return false;
    const matches = expected.sessionTag
      ? current.sessionTag === expected.sessionTag
      : current === expected;
    if (!matches) return false;
    this.clear(reason);
    return true;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** 005 consumes this to drop private view state (contracts/frontend-handoff.md). */
  onEndAdmission(listener: EndListener) {
    endListeners.add(listener);
    return () => {
      endListeners.delete(listener);
    };
  },
};
