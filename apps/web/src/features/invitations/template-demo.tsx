'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import {
  usePrivateOwner,
  useOperationLifetime,
} from '../identity-access/session/operation-scope';
import { findTemplateChoice } from './api';
import {
  PreviewFeedback,
  TemplatePreview,
  templateError,
  useTemplateCreation,
  useTemplatePreview,
} from './template-preview';
import { Button } from '../../ui/platform/button';
import { InlineAlert, LocalStatus } from '../../ui/platform/feedback';
import styles from './template-demo.module.css';

function Flowers({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      className={flip ? styles.flowerRight : styles.flowerLeft}
      viewBox="0 0 140 260"
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M10 260Q62 133 93 35M14 240Q28 116 20 47M31 194Q65 148 125 122M45 149Q28 80 63 29M68 103Q101 78 125 47" />
        {[
          [93, 35],
          [20, 47],
          [125, 122],
          [63, 29],
          [125, 47],
        ].map(([x, y]) => (
          <g key={`${x}:${y}`}>
            <circle cx={x} cy={y} r="6" />
            <path
              d={`M${x - 10} ${y}q10 -25 20 0q-10 25 -20 0M${x} ${y - 10}q25 10 0 20q-25 -10 0 -20`}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}
function DemoContent({ id, revisionId }: { id: string; revisionId: string }) {
  const preview = useTemplatePreview(id, revisionId),
    creation = useTemplateCreation(`TemplateDemoCreate:${id}:${revisionId}`);
  const [opened, setOpened] = useState(false);
  const content = useRef<HTMLElement | null>(null),
    openButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (opened) content.current?.focus();
  }, [opened]);
  const ready = preview.state.status === 'ready' ? preview.state : null;
  const data = ready?.revision.sampleData;
  const event =
    data?.events && Object.values(data.events).find((event) => event?.datetime);
  const date =
    event?.datetime && Number.isFinite(Date.parse(event.datetime))
      ? new Intl.DateTimeFormat('vi-VN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: event.timeZone || 'Asia/Ho_Chi_Minh',
        }).format(new Date(event.datetime))
      : '';
  return (
    <main className={opened ? styles.demo : styles.opening}>
      {!opened ? (
        <section className={styles.card} aria-label="Lời mời mở thiệp">
          <Flowers />
          <Flowers flip />
          <span className={styles.seal}>
            <Heart size={24} fill="currentColor" aria-hidden="true" />
          </span>
          <h1>
            {data?.groom?.name || 'Chú rể'}
            <span>&amp;</span>
            {data?.bride?.name || 'Cô dâu'}
          </h1>
          {date && <p className={styles.date}>{date}</p>}
          <p>Thân mời</p>
          <PreviewFeedback {...preview} />
          <Button
            ref={openButton}
            disabled={!ready}
            onClick={() => setOpened(true)}
          >
            Mở thiệp
          </Button>
          <Link className={styles.back} href="/templates">
            Về kho mẫu
          </Link>
        </section>
      ) : (
        <>
          <header className={styles.toolbar}>
            <Link href="/templates">← Kho mẫu</Link>
            <span>Demo · Không gửi RSVP</span>
            <Button
              disabled={!ready || creation.uncertain || creation.unavailable}
              busy={creation.busy}
              onClick={() => void creation.create(id, revisionId)}
            >
              Chọn mẫu này
            </Button>
          </header>
          {creation.error && (
            <InlineAlert tone="error">
              {creation.error}
              <p>
                <Link href={creation.uncertain ? '/invitations' : '/templates'}>
                  {creation.uncertain
                    ? 'Kiểm tra Thiệp của tôi'
                    : 'Tải lại kho mẫu'}
                </Link>
              </p>
            </InlineAlert>
          )}
          <section
            ref={content}
            tabIndex={-1}
            aria-label="Demo mẫu thiệp"
            className={styles.content}
          >
            {ready && <TemplatePreview ready={ready} />}
          </section>
          <div className={styles.reopen}>
            <Button
              variant="secondary"
              onClick={() => {
                setOpened(false);
                requestAnimationFrame(() => openButton.current?.focus());
              }}
            >
              Xem lại lời mời
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
function OwnedTemplateDemo({
  id,
  revisionId,
}: {
  id: string;
  revisionId?: string;
}) {
  const lifetime = useOperationLifetime(`TemplateDemo:${id}`);
  const [resolved, setResolved] = useState(revisionId ?? ''),
    [error, setError] = useState('');
  useEffect(() => {
    if (revisionId) return;
    const scope = lifetime.capture();
    void findTemplateChoice(id, { scope })
      .then((choice) => {
        if (scope.isActive()) setResolved(choice.publishedRevisionId);
      })
      .catch((cause) => {
        if (scope.isActive()) setError(templateError(cause));
      });
    return () => scope.dispose();
  }, [id, revisionId, lifetime]);
  if (error)
    return (
      <main className={styles.loading}>
        <InlineAlert tone="error">
          {error}
          <p>
            <Link href="/templates">Tải lại kho mẫu</Link>
          </p>
        </InlineAlert>
      </main>
    );
  return resolved ? (
    <DemoContent key={`${id}:${resolved}`} id={id} revisionId={resolved} />
  ) : (
    <main className={styles.loading}>
      <LocalStatus tone="neutral">Đang tìm mẫu thiệp…</LocalStatus>
    </main>
  );
}
export function TemplateDemo({
  id,
  revisionId,
}: {
  id: string;
  revisionId?: string;
}) {
  const owner = usePrivateOwner(
    `TemplateDemo:${id}:${revisionId ?? ''}`,
    'CUSTOMER',
  );
  return owner ? (
    <OwnedTemplateDemo key={owner} id={id} revisionId={revisionId} />
  ) : (
    <main className={styles.loading}>
      <p role="alert">Vui lòng đăng nhập tài khoản Customer để xem demo.</p>
      <Link href="/login">Đăng nhập</Link>
    </main>
  );
}
