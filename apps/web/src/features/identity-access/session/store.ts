import type { AccessSession } from '../api/client';

type Listener = () => void;
let current: AccessSession | null = null;
const listeners = new Set<Listener>();

export const sessionStore = {
  get: () => current,
  set(session: AccessSession) {
    current = session;
    for (const listener of listeners) listener();
  },
  clear() {
    current = null;
    for (const listener of listeners) listener();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
