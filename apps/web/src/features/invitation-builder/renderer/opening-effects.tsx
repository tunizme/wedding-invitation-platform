'use client';
/* eslint-disable @next/next/no-img-element -- Authored bytes and animated GIFs must render without image optimization. */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { OpeningEffect } from '../document/effects';
import {
  getInvitationFont,
  type InvitationFontId,
} from '../document/font-catalog';
import {
  effectAsset,
  effectImageUrl,
  DOOR_TEXTURE_IMAGES,
} from './effect-catalog';
import styles from './opening-effects.module.css';
import { useReducedMotion } from './motion-preference';

function names(groom: string, bride: string) {
  return [groom, bride].filter(Boolean).join(' & ');
}
function initial(name: string) {
  return name.trim().split(/\s+/).at(-1)?.[0] ?? '';
}
export function OpeningArtwork({
  effect,
  assetUrls = {},
  guestName,
  revealing = false,
  paused = false,
}: {
  effect: OpeningEffect;
  assetUrls?: Record<string, string>;
  guestName?: string;
  revealing?: boolean;
  paused?: boolean;
}) {
  const nameFont =
    'font' in effect
      ? effect.font === 'aquarelle'
        ? 'Opening Aquarelle'
        : getInvitationFont(effect.font as InvitationFontId).family
      : undefined;
  const style = {
    '--name-font': nameFont,
    '--door-color': effect.kind === 'sliding-door' ? effect.color : undefined,
  } as CSSProperties;
  return (
    <div
      className={styles.artwork}
      data-kind={effect.kind}
      data-revealing={revealing}
      data-paused={paused}
      style={style}
    >
      {effect.kind === 'envelope' && (
        <div
          className={styles.envelope}
          data-variant={effect.variant}
          style={{
            backgroundImage: `url("${effectAsset(`opening-envelope/${effect.variant}/${effect.variant === 'classic' ? 'bg.webp' : effect.variant === 'begie' ? 'white-paper-texture-background.webp' : '../begie/white-paper-texture-background.webp'}`)}")`,
          }}
        >
          <p className={styles.envelopeTitle}>{effect.title}</p>
          <h3 className={styles.names}>{names(effect.groom, effect.bride)}</h3>
          <div className={styles.envelopeBody}>
            <img
              className={styles.floralLeft}
              src={effectAsset(
                `opening-envelope/${effect.variant}/${effect.variant === 'classic' ? 'floral-left.webp' : 'flower-left.webp'}`,
              )}
              alt=""
            />
            <img
              className={styles.envelopePaper}
              src={effectAsset(
                `opening-envelope/${effect.variant}/${effect.variant === 'classic' ? 'envelope.webp' : effect.variant === 'begie' ? 'envelope-begie.webp' : 'envelope-red.webp'}`,
              )}
              alt=""
            />
            <img
              className={styles.floralRight}
              src={effectAsset(
                `opening-envelope/${effect.variant}/${effect.variant === 'classic' ? 'floral-right-a.webp' : 'flower-right.webp'}`,
              )}
              alt=""
            />
            <div className={styles.seal}>
              <img
                src={effectAsset(
                  `opening-envelope/${effect.variant}/${effect.variant === 'classic' ? 'seal.webp' : effect.variant === 'begie' ? 'black-seal.webp' : 'seal.png'}`,
                )}
                alt=""
              />
              <span>
                {initial(effect.groom)}
                <br />
                {initial(effect.bride)}
              </span>
            </div>
          </div>
          <p className={styles.tap}>{effect.buttonText}</p>
        </div>
      )}
      {effect.kind === 'invitation' && (
        <div
          className={styles.invitation}
          data-theme={effect.theme}
          style={
            {
              '--ink': effect.colors.text,
              '--paper': effect.colors.background,
              '--button-bg': effect.colors.buttonBackground,
              '--button-ink': effect.colors.buttonText,
              background: `linear-gradient(135deg,${effect.colors.backdropStart},${effect.colors.backdropMiddle},${effect.colors.backdropEnd})`,
            } as CSSProperties
          }
        >
          <div className={styles.invitationPaper}>
            {effect.theme.startsWith('songlong') ? (
              <>
                <img
                  className={styles.dragonLeft}
                  src={effectAsset('themes/songlong-red/dragon_left.webp')}
                  alt=""
                />
                <img
                  className={styles.dragonRight}
                  src={effectAsset('themes/songlong-red/dragon_right.webp')}
                  alt=""
                />
                <img
                  className={styles.happiness}
                  src={effectAsset(
                    'themes/songlong-red/chinese_happiness.webp',
                  )}
                  alt=""
                />
              </>
            ) : (
              <img
                className={styles.themeFloral}
                src={effectAsset(
                  `themes/${effect.theme === 'longphung-v1-green' || effect.theme === 'longphung-v1-lam' ? 'red-v1' : effect.theme === 'vuonxuan-green' ? 'nature' : effect.theme}/${effect.theme.startsWith('songphung') ? 'HOA.webp' : effect.theme === 'red-v1' || effect.theme === 'longphung-v1-green' || effect.theme === 'longphung-v1-lam' ? 'rong.webp' : effect.theme === 'longphung-v2-red' ? 'phuong.webp' : effect.theme === 'la-ngoc-green' ? 'la1.webp' : effect.theme === 'vuonxuan-green' ? 'flower_top.webp' : 'flower.webp'}`,
                )}
                alt=""
              />
            )}
            <h3>
              {effect.person1}
              <br />
              &amp;
              <br />
              {effect.person2}
            </h3>
            <span>❦</span>
            <p>{effect.date}</p>
            <p>{effect.guestLabel}</p>
            <strong>{guestName || effect.guestName}</strong>
            <p>{effect.message}</p>
            <span className={styles.invitationButton}>{effect.buttonText}</span>
          </div>
        </div>
      )}
      {effect.kind === 'intro' && (
        <div className={styles.intro} data-variant={effect.variant}>
          {effect.images.map((image, i) => {
            const src = effectImageUrl(image, assetUrls);
            return src ? (
              <img key={i} data-intro-layer={i} src={src} alt="" />
            ) : (
              <div key={i} data-intro-layer={i} />
            );
          })}
        </div>
      )}
      {effect.kind === 'curtain' && (
        <div className={styles.curtain} data-color={effect.color}>
          <div />
          <div />
        </div>
      )}
      {effect.kind === 'sliding-door' && (
        <div
          className={styles.doors}
          data-texture={effect.texture}
          style={
            {
              '--texture':
                effect.mode === 'texture' && DOOR_TEXTURE_IMAGES[effect.texture]
                  ? `url("${DOOR_TEXTURE_IMAGES[effect.texture]}")`
                  : undefined,
            } as CSSProperties
          }
        >
          {[0, 1].map((i) => (
            <div key={i} className={styles.door}>
              {effect.mode === 'image' &&
                effectImageUrl(effect.images[i], assetUrls) && (
                  <img
                    className={styles.doorImage}
                    src={effectImageUrl(effect.images[i], assetUrls)}
                    alt=""
                  />
                )}
              {i === 1 && effectImageUrl(effect.seal, assetUrls) && (
                <img
                  className={styles.doorSeal}
                  src={effectImageUrl(effect.seal, assetUrls)}
                  alt=""
                />
              )}
            </div>
          ))}
          {effect.trigger === 'tap' && (
            <span className={styles.doorHint}>CHẠM ĐỂ MỞ</span>
          )}
        </div>
      )}
      {effect.kind === 'animated-image' && (
        <div className={styles.animated}>
          <h3>{effect.title}</h3>
          {effectImageUrl(effect.image, assetUrls) && (
            <img src={effectImageUrl(effect.image, assetUrls)} alt="" />
          )}
          <p>{effect.subtitle}</p>
        </div>
      )}
      {effect.kind === 'photobooth' && (
        <div
          className={styles.photobooth}
          style={{ background: effect.background, color: effect.color }}
        >
          <p>{effect.title}</p>
          <h3 className={styles.names}>{names(effect.groom, effect.bride)}</h3>
          <div className={styles.photoStage}>
            <img
              className={styles.photoFrame}
              src={effectAsset('photobooth/frame.webp')}
              alt=""
            />
            <div className={styles.strip}>
              {effect.images.map((image, i) => (
                <div key={i}>
                  {effectImageUrl(image, assetUrls) ? (
                    <img
                      src={effectImageUrl(image, assetUrls)}
                      alt={`Ảnh ${i + 1}`}
                    />
                  ) : (
                    <span>ẢNH {i + 1}</span>
                  )}
                </div>
              ))}
              <p>{effect.footer}</p>
            </div>
          </div>
          <p>{effect.buttonText}</p>
        </div>
      )}
    </div>
  );
}
/** A paused timer retains elapsed time; effect changes remount the player in its owner. */
function useCountdown(
  duration: number | null,
  paused: boolean,
  complete: () => void,
  phase: boolean,
) {
  const latest = useRef(complete);
  useEffect(() => {
    latest.current = complete;
  });
  const remaining = useRef(duration);
  useEffect(() => {
    remaining.current = duration;
  }, [duration, phase]);
  useEffect(() => {
    if (paused || duration === null) return;
    const start = Date.now();
    const timer = setTimeout(
      () => latest.current(),
      remaining.current ?? duration,
    );
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(
        0,
        (remaining.current ?? duration) - (Date.now() - start),
      );
    };
  }, [duration, paused, phase]);
}
export function OpeningPlayer({
  effect,
  assetUrls,
  guestName,
  paused = false,
  onComplete,
  onActivate,
}: {
  effect: OpeningEffect;
  assetUrls: Record<string, string>;
  guestName?: string;
  paused?: boolean;
  onComplete: () => void;
  onActivate?: () => void;
}) {
  const [revealing, setRevealing] = useState(false);
  const reduced = useReducedMotion();
  const auto =
    effect.kind === 'intro' ||
    effect.kind === 'curtain' ||
    effect.kind === 'animated-image' ||
    (effect.kind === 'sliding-door' && effect.trigger === 'auto');
  const dwell =
    effect.kind === 'animated-image' ? effect.duration * 1000 : 1000;
  const revealDuration =
    effect.kind === 'sliding-door'
      ? 3000
      : effect.kind === 'envelope'
        ? 1400
        : 1000;
  useCountdown(
    revealing ? revealDuration : auto ? dwell : null,
    paused,
    () => {
      if (revealing) onComplete();
      else setRevealing(true);
    },
    revealing,
  );
  useEffect(() => {
    if ((auto || revealing) && reduced) onComplete();
  }, [auto, revealing, reduced, onComplete]);
  const label =
    'buttonText' in effect ? effect.buttonText || 'Mở thiệp' : 'Mở thiệp';
  return (
    <div className={styles.player} data-opening-effect={effect.kind}>
      <OpeningArtwork
        effect={effect}
        assetUrls={assetUrls}
        guestName={guestName}
        revealing={revealing}
        paused={paused}
      />
      {!auto && (
        <button
          className={styles.openButton}
          aria-label={label}
          disabled={revealing}
          onClick={() => {
            onActivate?.();
            if (reduced) onComplete();
            else setRevealing(true);
          }}
        >
          <span>{label}</span>
        </button>
      )}
    </div>
  );
}
