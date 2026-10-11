/// <reference types="vite/client" />
import type {
  RenderContext,
  ValidationIssue,
} from '../../src/features/invitation-builder/document/types';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import '../../src/features/invitation-builder/renderer/fonts.css';
import { createRoot } from 'react-dom/client';

export type HostInput = {
  width: number;
  mode: 'preview' | 'public';
  fixture?: unknown;
  popup?: boolean;
  assetUrls?: Record<string, string>;
  validationState?: RenderContext['validationState'];
};
export type HostAdapter = ComponentType<{ input: HostInput }>;
declare global {
  interface Window {
    responsiveHost: {
      mount: (
        input: HostInput,
        adapter?: 'stub' | 'production' | 'capture',
      ) => Promise<void>;
      resize: (width: number) => Promise<void>;
      measure: () => Promise<{ ready: boolean; issues: ValidationIssue[] }>;
    };
  }
}
// Tests choose an adapter; optional modules are unavailable until their owning tasks create them.
const adapters = import.meta.glob(
  '../../src/features/invitation-builder/renderer/v2/*host-adapter.tsx',
);
let measureAdapter:
  | ((
      input: HostInput,
      root: HTMLElement,
    ) => Promise<{ ready: boolean; issues: ValidationIssue[] }>)
  | undefined;
let updateInput: ((input: HostInput) => void) | undefined;
let latest: HostInput = { width: 390, mode: 'preview' };
function Stub({ input }: { input: HostInput }) {
  return <div data-host-stub>{input.mode} host</div>;
}
const settled = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
function Host({
  adapter: Adapter,
  initial,
}: {
  adapter: HostAdapter;
  initial: HostInput;
}) {
  const [input, setInput] = useState(initial);
  useEffect(() => {
    updateInput = setInput;
    return () => {
      if (updateInput === setInput) updateInput = undefined;
    };
  }, []);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (input.popup && element && !element.open) element.showModal();
    return () => element?.close();
  }, [input.popup]);
  const content = (
    <main
      data-test-host
      style={{
        width: input.width,
        maxWidth: input.popup ? 390 : undefined,
        marginInline: 'auto',
      }}
    >
      <Adapter input={input} />
    </main>
  );
  return input.popup ? (
    <dialog
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
          ),
        ].filter((el) => el.getClientRects().length > 0);
        const target = event.shiftKey ? controls.at(-1) : controls[0];
        if (
          document.activeElement ===
          (event.shiftKey ? controls[0] : controls.at(-1))
        ) {
          event.preventDefault();
          target?.focus();
        }
      }}
      ref={dialog}
      aria-label="Xem trước mobile"
      style={{
        width: 'min(390px, calc(100vw - 32px))',
        maxWidth: 390,
        padding: 0,
        border: 0,
        maxHeight: 'calc(100vh - 32px)',
        overflow: 'auto',
      }}
    >
      <button
        type="button"
        autoFocus
        style={{ minHeight: 44 }}
        onClick={() => dialog.current?.close()}
      >
        Đóng xem trước
      </button>
      {content}
    </dialog>
  ) : (
    content
  );
}
const root = createRoot(document.getElementById('root')!);
window.responsiveHost = {
  async measure() {
    if (!measureAdapter) throw new Error('Missing measurement adapter');
    return measureAdapter(
      latest,
      document.querySelector<HTMLElement>('[data-test-host]')!,
    );
  },
  async mount(input, adapter = 'stub') {
    if (!Number.isFinite(input.width) || input.width < 0)
      throw new Error('Invalid test width.');
    let Adapter: HostAdapter = Stub;
    if (adapter === 'capture') {
      Adapter = (
        await import('../../src/features/invitation-builder/renderer/capture-harness')
      ).CaptureHarness;
      measureAdapter = undefined;
    } else if (adapter !== 'stub') {
      const key = Object.keys(adapters).find((key) =>
        key.endsWith(`/${adapter}-host-adapter.tsx`),
      );
      if (!key) throw new Error(`Missing ${adapter} adapter prerequisite.`);
      const adapterModule = (await adapters[key]()) as {
        default: HostAdapter;
        measureHost?: typeof measureAdapter;
      };
      Adapter = adapterModule.default;
      measureAdapter = adapterModule.measureHost;
    }
    if (adapter === 'stub') measureAdapter = undefined;
    latest = input;
    root.render(<Host key={adapter} adapter={Adapter} initial={input} />);
    await settled();
  },
  async resize(width) {
    if (!Number.isFinite(width) || width < 0 || !updateInput)
      throw new Error('Invalid resize or unmounted host.');
    latest = { ...latest, width };
    updateInput(latest);
    await settled();
  },
};
