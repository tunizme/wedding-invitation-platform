import type { Metadata } from 'next';
import { CaptureHarness } from '@/features/invitation-builder/renderer/capture-harness';
import '@/features/invitation-builder/renderer/fonts.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Invitation render harness',
};

export default function InvitationRendererHarnessPage() {
  return <CaptureHarness />;
}
