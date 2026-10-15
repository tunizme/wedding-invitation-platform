'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Crop, Images } from 'lucide-react';
import { AssetImage } from '../renderer/asset-image';
import type { NodeOptions } from '../document/editor-document';
import { ImageCropDialog, type CropResult } from './image-crop-dialog';
import styles from './property-controls.module.css';

/**
 * Preview and primary action at the top of the image/decoration panel:
 * images crop in place, decorations swap their artwork.
 */
export function MediaHeader({
  kind,
  source,
  options,
  disabled,
  replaceDisabled,
  onReplace,
  onCrop,
}: {
  kind: 'Image' | 'Decoration';
  source: string | undefined;
  options: NodeOptions;
  disabled: boolean;
  replaceDisabled: boolean;
  onReplace: (trigger: HTMLElement | null) => void;
  /** Returns false when the document rejected the change. */
  onCrop: (result: CropResult) => boolean;
}) {
  const [cropping, setCropping] = useState(false);
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(false), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <div className={styles.mediaHeader}>
      <div className={styles.mediaPreview}>
        <AssetImage
          source={source}
          alt={kind === 'Image' ? 'Ảnh đang chọn' : 'Hình trang trí đang chọn'}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
      {kind === 'Image' ? (
        <button
          type="button"
          className={styles.mediaButton}
          disabled={disabled || !source}
          onClick={() => setCropping(true)}
        >
          <Crop size={16} aria-hidden="true" />
          Cắt ảnh
        </button>
      ) : (
        <button
          type="button"
          className={styles.changeButton}
          disabled={disabled || replaceDisabled}
          onClick={(event) => onReplace(event.currentTarget)}
        >
          <Images size={16} aria-hidden="true" />
          Thay đổi
        </button>
      )}
      {cropping && source && (
        <ImageCropDialog
          source={source}
          options={options}
          onCancel={() => setCropping(false)}
          onConfirm={(result) => {
            setCropping(false);
            if (onCrop(result)) setNotice(true);
          }}
        />
      )}
      <div className={styles.toastRegion} role="status" aria-live="polite">
        {notice && (
          <span className={styles.toast}>
            <CheckCircle2 size={16} aria-hidden="true" />
            Cập nhật ảnh thành công
          </span>
        )}
      </div>
    </div>
  );
}
