import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { builderDatabase } from './database';
import type { TemplateDesignV2 } from '../../../src/modules/invitation-builder/domain/document.types';

export function responsiveDocument(
  assets?: readonly [string, string],
): TemplateDesignV2 {
  const document = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../../../specs/007-responsive-invitation-layout/contracts/fixtures/valid-v2.json',
      ),
      'utf8',
    ),
  ) as TemplateDesignV2;
  for (const section of Object.values(document.sections)) {
    section.flowNodeIds = section.flowNodeIds.filter((id) => {
      const node = document.nodes[id];
      if (node.type !== 'Image') return true;
      if (!assets) {
        delete document.nodes[id];
        return false;
      }
      node.content.assetId = assets[section.flowNodeIds.indexOf(id) % 2];
      return true;
    });
  }
  return document;
}
/** The existing database fixture owns its schema, actors, objects and teardown. */
export async function responsiveDatabase() {
  const runtime = await builderDatabase();
  return { ...runtime, responsiveRunId: randomUUID() };
}
