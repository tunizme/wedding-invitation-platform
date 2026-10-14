import {
  createBlankDocument,
  defaultEditorSettings,
  type EditorDocument,
  type EditorScene,
} from '../../../src/modules/invitation-builder/domain/editor-document';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WeddingData } from '../../../src/modules/invitation-builder/domain/document.types';

const corpus = resolve(
  __dirname,
  '../../../../../specs/004-invitation-builder/contracts/fixtures',
);
export const fixtureBytes = () =>
  readFileSync(resolve(corpus, 'assets/photo.png'));
export const blankDesign = (): EditorDocument => createBlankDocument();
export const emptyWedding = (): WeddingData => ({ schemaVersion: 1 });
export const sampleWedding = (
  name: 'sample-a' | 'sample-b' = 'sample-a',
): WeddingData =>
  JSON.parse(
    readFileSync(resolve(corpus, name + '.json'), 'utf8'),
  ) as WeddingData;
export const emptyScene = (): EditorScene => ({
  schemaVersion: 3,
  rendererContractVersion: 3,
  canvas: blankDesign().nodes.ROOT.props.canvas,
  elements: [],
  nodeOptions: {},
  settings: defaultEditorSettings(),
});

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
