'use client';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { X } from 'lucide-react';
import {
  CROP_ASPECTS,
  CROP_SHAPES,
  type CropAspect,
  type CropShape,
  type NodeOptions,
} from '../document/editor-document';
import {
  CROP_SHAPE_LABELS,
  cropShapeStyle,
  cropShapeUrl,
} from '../renderer/crop-shapes';
import {
  aspectRatio,
  autoCropRect,
  denormalizeCrop,
  moveCropRect,
  normalizeCrop,
  resizeCropRect,
  type CropHandle,
  type CropRect,
} from './crop-geometry';
import styles from './image-crop-dialog.module.css';

const STAGE = { width: 552, height: 540 };
const HANDLES: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const ASPECT_LABELS: Record<CropAspect, string> = {
  free: 'Tự do',
  '1:1': '1:1',
  '3:2': '3:2',
  '2:3': '2:3',
  '4:3': '4:3',
  '16:9': '16:9',
};
const TILE_FILL = '#76828E';

export interface CropResult {
  crop?: NonNullable<NodeOptions['crop']>;
  cropAspect?: CropAspect;
  mask?: CropShape;
  /** Width / height of the cropped area in image pixels. */
  pixelAspect: number;
}

export function ImageCropDialog({
  source,
  options,
  onCancel,
  onConfirm,
}: {
  source: string;
  options: NodeOptions;
  onCancel: () => void;
  onConfirm: (result: CropResult) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{
    handle: CropHandle | 'move';
    x: number;
    y: number;
    rect: CropRect;
  } | null>(null);
  const [image, setImage] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [rect, setRect] = useState<CropRect | null>(null);
  const [aspect, setAspect] = useState<CropAspect>(
    options.cropAspect ?? 'free',
  );
  const [shape, setShape] = useState<Exclude<CropShape, 'none'> | undefined>(
    options.mask && options.mask !== 'none' ? options.mask : undefined,
  );

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const loaded = (natural: HTMLImageElement) => {
    const scale = Math.min(
      STAGE.width / natural.naturalWidth,
      STAGE.height / natural.naturalHeight,
    );
    const size = {
      width: natural.naturalWidth * scale,
      height: natural.naturalHeight * scale,
    };
    setImage(size);
    setRect(
      options.crop
        ? denormalizeCrop(options.crop, size.width, size.height)
        : autoCropRect(size.width, size.height, aspectRatio(aspect)),
    );
  };

  const chooseAspect = (next: CropAspect) => {
    setAspect(next);
    if (image)
      setRect(autoCropRect(image.width, image.height, aspectRatio(next)));
  };

  const startDrag = (
    event: ReactPointerEvent<HTMLElement>,
    handle: CropHandle | 'move',
  ) => {
    if (!rect || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { handle, x: event.clientX, y: event.clientY, rect };
  };
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || !image) return;
    const dx = event.clientX - state.x,
      dy = event.clientY - state.y;
    setRect(
      state.handle === 'move'
        ? moveCropRect(state.rect, dx, dy, image.width, image.height)
        : resizeCropRect(
            state.rect,
            state.handle,
            dx,
            dy,
            image.width,
            image.height,
            aspectRatio(aspect),
          ),
    );
  };
  const endDrag = () => {
    drag.current = null;
  };
  // Keyboard alternative to dragging: arrows move, Shift+arrows move faster.
  const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!rect || !image) return;
    const step = event.shiftKey ? 10 : 1;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    setRect(moveCropRect(rect, delta[0], delta[1], image.width, image.height));
  };

  const confirm = () => {
    if (!rect || !image) return;
    onConfirm({
      crop: normalizeCrop(rect, image.width, image.height),
      cropAspect: aspect === 'free' ? undefined : aspect,
      mask: shape,
      pixelAspect: rect.width / rect.height,
    });
  };

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="image-crop-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="image-crop-title" className={styles.title}>
        Cắt ảnh
      </h2>
      <div className={styles.body}>
        <div className={styles.stage}>
          <div
            className={styles.frame}
            style={
              image
                ? { width: image.width, height: image.height }
                : { visibility: 'hidden' }
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- blob/object URLs */}
            <img
              src={source}
              alt=""
              draggable={false}
              className={styles.image}
              onLoad={(event) => loaded(event.currentTarget)}
            />
            <div className={styles.dim} aria-hidden="true" />
            {rect && image && (
              <div
                className={styles.cropBox}
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                }}
                role="group"
                tabIndex={0}
                aria-label="Vùng cắt ảnh. Dùng phím mũi tên để di chuyển."
                onPointerDown={(event) => startDrag(event, 'move')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={nudge}
              >
                <div className={styles.view} style={cropShapeStyle(shape)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- same source as above */}
                  <img
                    src={source}
                    alt=""
                    draggable={false}
                    style={{
                      left: -rect.x,
                      top: -rect.y,
                      width: image.width,
                      height: image.height,
                    }}
                  />
                </div>
                <span className={styles.gridLines} aria-hidden="true" />
                <span className={styles.center} aria-hidden="true" />
                {HANDLES.map((handle) => (
                  <span
                    key={handle}
                    className={styles.handle}
                    data-handle={handle}
                    aria-hidden="true"
                    onPointerDown={(event) => startDrag(event, handle)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={styles.controls}>
          <div className={styles.shapeTitle}>
            <span>Hình dạng cắt:</span>
            {shape && (
              <span
                className={styles.activeShape}
                style={{ backgroundImage: cropShapeUrl(shape, TILE_FILL) }}
                title={CROP_SHAPE_LABELS[shape]}
              >
                <button
                  type="button"
                  className={styles.resetShape}
                  aria-label="Bỏ hình dạng cắt"
                  onClick={() => setShape(undefined)}
                >
                  <X size={8} strokeWidth={3} aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
          <ul className={styles.shapeList} aria-label="Hình dạng cắt">
            {CROP_SHAPES.filter(
              (id): id is Exclude<CropShape, 'none'> => id !== 'none',
            ).map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className={styles.shape}
                  aria-label={CROP_SHAPE_LABELS[id]}
                  title={CROP_SHAPE_LABELS[id]}
                  aria-pressed={shape === id}
                  style={{ backgroundImage: cropShapeUrl(id, TILE_FILL) }}
                  onClick={() => setShape(id)}
                />
              </li>
            ))}
          </ul>
          <h3 className={styles.ratioTitle}>Tỷ lệ khung hình</h3>
          <div
            className={styles.ratios}
            role="group"
            aria-label="Tỷ lệ khung hình"
          >
            {CROP_ASPECTS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={aspect === id}
                onClick={() => chooseAspect(id)}
              >
                {ASPECT_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <footer className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Hủy
        </button>
        <button
          type="button"
          className={styles.confirm}
          disabled={!rect}
          onClick={confirm}
        >
          Xác nhận
        </button>
      </footer>
    </dialog>
  );
}
