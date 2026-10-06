import { Inject } from '@nestjs/common';
import sharp from 'sharp';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import type { AssetKind, AssetScope } from '../domain/entities';
import { AssetWriteService } from './asset-write.service';
import type { StorageContext } from '../domain/asset-store.port';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;
const MAX_EDGE = 10_000;
const MAX_OUTPUT_EDGE = 4096;
const MAX_DECODE_MS = 10_000;
type InputFormat = 'jpeg' | 'png' | 'webp';
type UploadFile = { buffer: Buffer; mimetype: string; size: number };

export class UploadService {
  private activeDecodes = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(@Inject(AssetWriteService) private readonly writes: AssetWriteService) {}

  private async acquire(context: StorageContext): Promise<() => void> {
    if (context.signal?.aborted || Date.now() >= context.deadline)
      throw new BuilderProblemException(503, 'STORAGE_UNAVAILABLE', [], 5);
    if (this.activeDecodes >= 2) {
      if (this.waiters.length >= 10)
        throw new BuilderProblemException(503, 'STORAGE_UNAVAILABLE', [], 5);
      await new Promise<void>((resolve, reject) => {
        const remaining = Math.min(MAX_DECODE_MS, context.deadline - Date.now());
        if (remaining <= 0) return reject(new BuilderProblemException(503, 'STORAGE_UNAVAILABLE', [], 5));
        const timer = setTimeout(() => {
          const index = this.waiters.indexOf(grant);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new BuilderProblemException(503, 'STORAGE_UNAVAILABLE', [], 5));
        }, remaining);
        const grant = () => { clearTimeout(timer); resolve(); };
        this.waiters.push(grant);
      });
    } else this.activeDecodes++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) next();
      else this.activeDecodes--;
    };
  }

  private async normalize(file: UploadFile): Promise<{ bytes: Buffer; width: number; height: number }> {
    if (!Buffer.isBuffer(file.buffer) || file.size > MAX_BYTES || file.buffer.length === 0 || file.buffer.length > MAX_BYTES)
      throw new BuilderProblemException(422, 'UPLOAD_INVALID');
    const expected: Record<string, InputFormat> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
    const declared = expected[file.mimetype];
    if (!declared) throw new BuilderProblemException(422, 'UPLOAD_INVALID');
    try {
      const decoder = sharp(file.buffer, { limitInputPixels: MAX_PIXELS, animated: true, failOn: 'error' }).timeout({ seconds: 10 });
      const metadata = await decoder.metadata();
      if (!metadata.width || !metadata.height || !metadata.format || metadata.format !== declared ||
          metadata.width > MAX_EDGE || metadata.height > MAX_EDGE || metadata.width * metadata.height > MAX_PIXELS ||
          (metadata.pages ?? 1) !== 1)
        throw new BuilderProblemException(422, 'UPLOAD_INVALID');
      const normalized = await sharp(file.buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).timeout({ seconds: 10 })
        .rotate().resize({ width: MAX_OUTPUT_EDGE, height: MAX_OUTPUT_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90, effort: 4 }).toBuffer({ resolveWithObject: true });
      if (!normalized.info.width || !normalized.info.height || normalized.info.width > MAX_OUTPUT_EDGE || normalized.info.height > MAX_OUTPUT_EDGE)
        throw new BuilderProblemException(422, 'UPLOAD_INVALID');
      return { bytes: normalized.data, width: normalized.info.width, height: normalized.info.height };
    } catch (error) {
      if (error instanceof BuilderProblemException) throw error;
      if (error instanceof Error && /timeout|timed out/i.test(error.message))
        throw new BuilderProblemException(503, 'STORAGE_UNAVAILABLE', [], 5);
      throw new BuilderProblemException(422, 'UPLOAD_INVALID');
    }
  }

  async upload(file: UploadFile | undefined, input: Record<string, unknown>, actor: AuthenticatedPrincipal, context: StorageContext) {
    if (!input || typeof input !== 'object' || Object.keys(input).some((key) => !['name', 'kind'].includes(key)) ||
        !file || typeof input.name !== 'string' || !input.name.trim() || [...input.name.trim()].length > 120)
      throw new BuilderProblemException(422, 'UPLOAD_INVALID');
    const allowed = actor.role === 'ADMIN' ? ['IMAGE', 'DECORATION', 'BACKGROUND'] : ['IMAGE'];
    if (typeof input.kind !== 'string' || !allowed.includes(input.kind))
      throw new BuilderProblemException(422, 'UPLOAD_INVALID');
    const release = await this.acquire(context);
    try {
      const normalized = await this.normalize(file);
      if (context.signal?.aborted || Date.now() >= context.deadline)
        throw new BuilderProblemException(503, 'STORAGE_UNAVAILABLE', [], 5);
      const scope: AssetScope = actor.role === 'ADMIN' ? 'TEMPLATE' : 'CUSTOMER';
      const kind = input.kind as Exclude<AssetKind, 'THUMBNAIL'>;
      return await this.writes.upload(normalized.bytes, 'image/webp', {
        scope,
        owner_user_id: actor.userId,
        uploaded_by: actor.userId,
        assistance_invitation_id: null,
        name: input.name.trim(),
        kind,
        width: normalized.width,
        height: normalized.height,
      }, context);
    } finally {
      release();
    }
  }
}
