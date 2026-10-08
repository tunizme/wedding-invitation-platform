import { iamRequest, REQUEST_DEADLINE_MS } from '../api/client';
import {
  readSelector,
  selectorStore,
  type SelectorRecord,
} from './auth-selector';

const RECOVERY_BUDGET_MS = 30_000;
const MAX_PROBES = 2;

export interface IntentOutcome {
  authProtocol: 2;
  intentId: string;
  state: 'RESERVED' | 'COMMITTED' | 'SUPERSEDED' | 'FAILED' | 'EXPIRED';
  outcomeCode: string | null;
  contextRevision: number;
  currentSessionTag: string | null;
}

export type Reconciliation =
  | { state: 'NO_PENDING_INTENT' }
  | { state: 'UNCERTAIN'; probes: number; outcome?: IntentOutcome }
  | { state: 'RECEIPT'; probes: number; outcome: IntentOutcome };

/** Read-only reconciliation. It deliberately never retries the original mutation. */
export async function reconcilePendingIntent(
  record?: SelectorRecord,
  now = () => Date.now(),
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
  isCurrent = () => true,
): Promise<Reconciliation> {
  const selected = record ?? (await readSelector(await selectorStore()));
  const pending = selected.pendingIntent;
  if (!pending) return { state: 'NO_PENDING_INTENT' };
  if (!pending.intentId || !selected.contextId)
    return { state: 'UNCERTAIN', probes: 0 };

  const started = now();
  let latest: IntentOutcome | undefined;
  let probes = 0;
  for (; probes < MAX_PROBES;) {
    if (!isCurrent()) break;
    if (now() - started + REQUEST_DEADLINE_MS > RECOVERY_BUDGET_MS) break;
    probes += 1;
    try {
      latest = await iamRequest<IntentOutcome>(
        `/auth/contexts/${selected.contextId}/intents/${pending.intentId}`,
        {
          method: 'GET',
          cookieAuth: true,
          auth: { contextId: selected.contextId },
          expectProtocol: true,
        },
      );
      if (latest.state !== 'RESERVED')
        return { state: 'RECEIPT', probes, outcome: latest };
    } catch {
      // A missing receipt or failed probe cannot establish that dispatch did not occur.
    }
    if (probes < MAX_PROBES) {
      const remaining = RECOVERY_BUDGET_MS - (now() - started);
      if (remaining > 0) await wait(Math.min(250, remaining));
    }
  }
  return {
    state: 'UNCERTAIN',
    probes,
    ...(latest ? { outcome: latest } : {}),
  };
}
