import { scalePrimitiveDocument } from '../../web/src/features/invitation-builder/document/editor-document';
import { createDesign, type TemplateFixture } from './fixtures';
export const createPrototypeDesign = (template: TemplateFixture) =>
  scalePrimitiveDocument(createDesign(template));
