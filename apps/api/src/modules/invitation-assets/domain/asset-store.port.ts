export const ASSET_STORE = Symbol('ASSET_STORE');
export interface StorageContext {
  deadline: number;
  signal?: AbortSignal;
}
export interface StoredObject {
  bytes: Buffer;
  contentType: string;
}
export interface ObjectInfo {
  byteSize: number;
  contentType: string;
}
export interface ObjectPage {
  keys: string[];
  nextToken?: string;
}

/** Keys are provider-neutral paths relative to the configured private prefix. */
export interface AssetStore {
  put(
    key: string,
    bytes: Buffer,
    contentType: string,
    sha256: string,
    context: StorageContext,
  ): Promise<void>;
  get(
    key: string,
    maxBytes: number,
    context: StorageContext,
  ): Promise<StoredObject>;
  head(key: string, context: StorageContext): Promise<ObjectInfo | null>;
  delete(key: string, context: StorageContext): Promise<void>;
  list(
    relativePrefix: string,
    token: string | undefined,
    context: StorageContext,
  ): Promise<ObjectPage>;
}
export class StorageUnavailableError extends Error {
  readonly code = 'STORAGE_UNAVAILABLE';
  constructor() {
    super('STORAGE_UNAVAILABLE');
  }
}
export class AssetObjectMissingError extends Error {
  readonly code = 'ASSET_UNAVAILABLE';
  constructor() {
    super('ASSET_UNAVAILABLE');
  }
}
