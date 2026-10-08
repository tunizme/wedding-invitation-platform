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
  admission: () => admission,
  /** Reason the last private admission ended, for recovery UI (FR-006). */
  lastEndReason: () => lastEnd,
  set(session: AccessSession, next?: Admission) {
    version++;
    current = session;
    if (next) admission = next;
    lastEnd = null;
    notify();
  },
  clear(reason: EndAdmissionReason = 'LOGOUT') {
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
