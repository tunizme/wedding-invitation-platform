'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Gift, MessageSquare, Share2, Pause, Play } from 'lucide-react';
import { defaultOpeningEffect } from '../document/effects';
import { OpeningPlayer } from './opening-effects';
import { FallingEffects } from './falling-effects';
import { MusicIcon } from './music-icon';
import type { EditorScene } from '../document/editor-document';
import type { Bank, RenderContext, ResolvedElement } from '../document/types';
import { publicInteraction } from './content-widgets';
import { RenderElement } from './render-element';
import { GiftAccounts } from './gift-accounts';
import { ModalSurface } from '../../../ui/platform/modal-surface';
import styles from './invitation-presentation.module.css';
import { invitationFeatureVisibility } from '../../invitations/feature-visibility';

type Wish = { id: string; name: string; message: string };
function WishBook({ slug, locale }: { slug: string; locale: 'vi' | 'en' }) {
  const [items, setItems] = useState<Wish[]>([]),
    [name, setName] = useState(''),
    [message, setMessage] = useState(''),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [attempt, setAttempt] = useState<{ payload: string; key: string } | null>(
      null,
    );
  useEffect(() => {
    let active = true;
    void publicInteraction(
      `/public/invitations/${slug}/wishes`,
      undefined,
      undefined,
      'GET',
    )
      .then((v) => {
        if (active) setItems(v.items);
      })
      .catch(() => {
        if (active) setStatus('Không tải được lời chúc. Thử mở lại.');
      });
    return () => {
      active = false;
    };
  }, [slug]);
  return (
    <>
      <div>
        {items.map((w) => (
          <article key={w.id}>
            <strong>{w.name}</strong>
            <p>{w.message}</p>
          </article>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || sent) return;
          const body = { name: name.trim(), message: message.trim() },
            payload = JSON.stringify(body),
            request =
              attempt?.payload === payload
                ? attempt
                : { payload, key: crypto.randomUUID() };
          setAttempt(request);
          setBusy(true);
          setStatus('');
          try {
            await publicInteraction(
              `/public/invitations/${slug}/wishes`,
              body,
              request.key,
            );
            setSent(true);
            setStatus(
              locale === 'vi'
                ? 'Lời chúc đã gửi, đang chờ duyệt.'
                : 'Your wish was sent and awaits approval.',
            );
          } catch (c) {
            setStatus(c instanceof Error ? c.message : 'Lỗi kết nối');
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || sent}>
          <label>
            {locale === 'vi' ? 'Họ tên' : 'Name'}
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setAttempt(null);
              }}
            />
          </label>
          <label>
            {locale === 'vi' ? 'Lời chúc' : 'Wish'}
            <textarea
              required
              maxLength={1000}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setAttempt(null);
              }}
            />
          </label>
          <button>{locale === 'vi' ? 'Gửi lời chúc' : 'Send wish'}</button>
        </fieldset>
        {status && <p role="status">{status}</p>}
      </form>
    </>
  );
}
function browserId(): string {
  try {
    const old = localStorage.getItem('invitation-browser-id');
    if (old && /^[a-f0-9-]{36}$/.test(old)) return old;
    const id = crypto.randomUUID();
    localStorage.setItem('invitation-browser-id', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
export function InvitationPresentation({
  scene,
  context,
  children,
}: {
  scene: EditorScene;
  context: RenderContext;
  children: ReactNode;
}) {
  return (
    <PresentationBody
      key={JSON.stringify(
        scene.settings.openingEffect === undefined
          ? scene.settings.envelope
          : scene.settings.openingEffect,
      )}
      scene={scene}
      context={context}
    >
      {children}
    </PresentationBody>
  );
}
function PresentationBody({
  scene,
  context,
  children,
}: {
  scene: EditorScene;
  context: RenderContext;
  children: ReactNode;
}) {
  const settings = scene.settings,
    live = context.mode === 'public',
    motion = live || context.mode === 'preview',
    slug = context.invitation?.slug,
    locale = settings.locale;
  const opening =
    settings.openingEffect === undefined
      ? settings.envelope
        ? ({
            ...defaultOpeningEffect('envelope'),
            groom: '',
            bride: '',
            title: settings.title || 'Trân trọng kính mời',
            buttonText: locale === 'vi' ? 'Mở thiệp' : 'Open invitation',
          } as ReturnType<typeof defaultOpeningEffect>)
        : null
      : settings.openingEffect;
  const [opened, setOpened] = useState(!motion || !opening),
    [motionPaused, setMotionPaused] = useState(false),
    [playing, setPlaying] = useState(false),
    [scrolling, setScrolling] = useState(false),
    [modal, setModal] = useState<'wishes' | 'gift' | null>(null),
    [giftDetail, setGiftDetail] = useState<{
      accounts?: Bank[];
      title?: string;
    } | null>(null),
    [liked, setLiked] = useState(false),
    [count, setCount] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null),
    identity = useRef<string | null>(null),
    surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!live || !slug) return;
    let active = true;
    identity.current = browserId();
    if (invitationFeatureVisibility.likes && settings.toolbar.likes)
      void publicInteraction(
        `/public/invitations/${slug}/likes?browserId=${identity.current}`,
        undefined,
        undefined,
        'GET',
      )
        .then((v) => {
          if (active) {
            setCount(v.count);
            setLiked(v.liked);
          }
        })
        .catch(() => {});
    const gift = (event: Event) => {
      const detail = (
        event as CustomEvent<{ accounts?: Bank[]; title?: string }>
      ).detail;
      setGiftDetail(detail ?? null);
      setModal('gift');
    };
    window.addEventListener('invitation-gift', gift);
    return () => {
      active = false;
      window.removeEventListener('invitation-gift', gift);
    };
  }, [live, slug, settings.toolbar.likes]);
  useEffect(() => {
    if (audio.current) audio.current.volume = settings.audio.volume;
  }, [settings.audio.volume]);
  useEffect(() => {
    if (!motion || !opened || !surface.current) return;
    const elements =
      surface.current.querySelectorAll<HTMLElement>('[data-entrance]');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.animationPlayState = 'running';
            observer.unobserve(e.target);
          }
      },
      { threshold: 0.05 },
    );
    for (const e of elements) {
      e.style.animationPlayState = 'paused';
      observer.observe(e);
    }
    return () => observer.disconnect();
  }, [motion, scene.elements, opened]);
  useEffect(() => {
    if (
      !scrolling ||
      !live ||
      !opened ||
      !settings.autoScroll ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    let last = performance.now(),
      frame: number;
    const step = (now: number) => {
      const before = window.scrollY;
      window.scrollBy(0, ((now - last) / 1000) * settings.autoScroll);
      last = now;
      if (
        window.scrollY === before &&
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 1
      ) {
        setScrolling(false);
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const stop = () => setScrolling(false);
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
    };
  }, [scrolling, live, opened, settings.autoScroll]);
  const toggleAudio = async () => {
    if (!audio.current) return;
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else {
      try {
        const start = (settings.audio.trimStartMs ?? 0) / 1000;
        const end = settings.audio.trimEndMs;
        if (
          audio.current.currentTime < start ||
          (end !== undefined && audio.current.currentTime * 1000 >= end)
        )
          audio.current.currentTime = start;
        await audio.current.play();
        setPlaying(true);
      } catch {
        setError(
          locale === 'vi'
            ? 'Nhấn lại để phát nhạc.'
            : 'Tap again to play music.',
        );
      }
    }
  };
  const gift = scene.elements.find((e) => e.type === 'QRBank') as
    ResolvedElement | undefined;
  const configuredGift = Object.values(scene.nodeOptions).find(
    (option) => option.action?.kind === 'gift',
  );
  const toolbar = live && opened;
  return (
    <div
      ref={surface}
      className={styles.surface}
      data-motion-paused={motionPaused}
      style={{ width: 500, position: 'relative' }}
    >
      <div
        inert={!opened}
        aria-hidden={!opened || undefined}
        data-opening-covered={!opened}
      >
        {children}
      </div>
      {!opened && opening && (
        <OpeningPlayer
          effect={opening}
          assetUrls={context.assetUrls}
          guestName={context.guestName}
          paused={motionPaused}
          onComplete={() => setOpened(true)}
          onActivate={() => {
            if (settings.audio.assetId) void toggleAudio();
          }}
        />
      )}
      {motion && opened && (
        <FallingEffects
          kind={settings.particles}
          paused={motionPaused}
          viewport={live}
        />
      )}
      {live && settings.audio.assetId && (
        <audio
          ref={audio}
          src={context.assetUrls[settings.audio.assetId]}
          loop={settings.audio.loop}
          preload="none"
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={(event) => {
            const element = event.currentTarget;
            const end = settings.audio.trimEndMs;
            if (end === undefined || element.currentTime * 1000 < end) return;
            // Trim window ended: loop back to the start or stop.
            if (settings.audio.loop)
              element.currentTime = (settings.audio.trimStartMs ?? 0) / 1000;
            else {
              element.pause();
              element.currentTime = (settings.audio.trimStartMs ?? 0) / 1000;
            }
          }}
        />
      )}
      {toolbar && (
        <nav
          className={styles.toolbar}
          aria-label={locale === 'vi' ? 'Tiện ích thiệp' : 'Invitation tools'}
        >
          {settings.audio.assetId && (
            <button
              type="button"
              aria-label={
                locale === 'vi'
                  ? playing
                    ? 'Dừng nhạc'
                    : 'Phát nhạc'
                  : playing
                    ? 'Pause music'
                    : 'Play music'
              }
              aria-pressed={playing}
              onClick={() => void toggleAudio()}
              style={
                settings.audio.iconColor
                  ? { color: settings.audio.iconColor }
                  : undefined
              }
            >
              <MusicIcon index={settings.audio.iconStyle} size={20} />
            </button>
          )}
          {invitationFeatureVisibility.wishes &&
            settings.toolbar.wishes &&
            slug && (
              <button
                type="button"
                aria-label={locale === 'vi' ? 'Lời chúc' : 'Wishes'}
                onClick={() => setModal('wishes')}
              >
                <MessageSquare size={20} />
              </button>
            )}
          {invitationFeatureVisibility.likes &&
            settings.toolbar.likes &&
            slug && (
              <button
                type="button"
                disabled={busy}
                aria-label={locale === 'vi' ? 'Yêu thích' : 'Like'}
                aria-pressed={liked}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    const v = await publicInteraction(
                      `/public/invitations/${slug}/likes`,
                      { browserId: identity.current ?? browserId() },
                      undefined,
                      liked ? 'DELETE' : 'POST',
                    );
                    setLiked(v.liked);
                    setCount(v.count);
                  } catch (c) {
                    setError(c instanceof Error ? c.message : 'Lỗi kết nối');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Heart size={20} />
                <span>{count}</span>
              </button>
            )}
          {settings.toolbar.gift &&
            (gift || configuredGift?.giftAccounts?.length) && (
              <button
                type="button"
                aria-label={locale === 'vi' ? 'Mừng cưới' : 'Wedding gift'}
                onClick={() => {
                  setGiftDetail(
                    configuredGift
                      ? {
                          accounts: configuredGift.giftAccounts,
                          title: configuredGift.giftTitle,
                        }
                      : null,
                  );
                  setModal('gift');
                }}
              >
                <Gift size={20} />
              </button>
            )}
          {settings.toolbar.share && (
            <button
              type="button"
              aria-label={locale === 'vi' ? 'Chia sẻ' : 'Share'}
              onClick={async () => {
                try {
                  if (navigator.share)
                    await navigator.share({
                      title: settings.title,
                      url: window.location.href,
                    });
                  else {
                    await navigator.clipboard.writeText(window.location.href);
                    setError(
                      locale === 'vi' ? 'Đã sao chép link.' : 'Link copied.',
                    );
                  }
                } catch {
                  setError(
                    'Không thể chia sẻ. Sao chép địa chỉ trên trình duyệt.',
                  );
                }
              }}
            >
              <Share2 size={20} />
            </button>
          )}
          {(settings.particles !== 'none' ||
            Object.values(scene.nodeOptions).some(
              (o) => o.continuous && o.continuous !== 'none',
            )) && (
            <button
              type="button"
              aria-pressed={motionPaused}
              aria-label={
                locale === 'vi' ? 'Tạm dừng hiệu ứng' : 'Pause effects'
              }
              onClick={() => setMotionPaused((v) => !v)}
            >
              {motionPaused ? <Play size={20} /> : <Pause size={20} />}
            </button>
          )}
          {!!settings.autoScroll && (
            <button
              type="button"
              aria-label={locale === 'vi' ? 'Tự động cuộn' : 'Auto scroll'}
              aria-pressed={scrolling}
              onClick={() => setScrolling((v) => !v)}
            >
              {scrolling ? <Pause size={20} /> : <Play size={20} />}
            </button>
          )}
        </nav>
      )}
      {error && live && (
        <p role="status" className={styles.notice}>
          {error}
        </p>
      )}
      {modal &&
        live &&
        typeof document !== 'undefined' &&
        createPortal(
          <ModalSurface
            label={
              modal === 'gift' && giftDetail?.title
                ? giftDetail.title
                : locale === 'vi'
                  ? modal === 'wishes'
                    ? 'Lời chúc'
                    : 'Mừng cưới'
                  : modal === 'wishes'
                    ? 'Wishes'
                    : 'Wedding gift'
            }
            closeLabel={locale === 'vi' ? 'Đóng' : 'Close'}
            variant="centered"
            onClose={() => setModal(null)}
          >
            {modal === 'wishes' && slug ? (
              <WishBook slug={slug} locale={locale} />
            ) : giftDetail?.accounts?.length ? (
              <GiftAccounts accounts={giftDetail.accounts} locale={locale} />
            ) : gift ? (
              <RenderElement element={gift} context={context} contentOnly />
            ) : (
              <GiftAccounts accounts={[]} locale={locale} />
            )}
          </ModalSurface>,
          document.body,
        )}
    </div>
  );
}
