# Contract: Template document2 and resolved scene2

**Status**: Implemented and verified by feature007 all gate; see validation.md for run evidence. Existing document1 is unchanged. This contract is independent of Craft/Moveable serialization.

## Envelope

`TemplateDesignV2` has strict keys:

- `schemaVersion:2`.
- `viewport:{mobileMaxWidth:480, desktopMinWidth:768, desktopMaxWidth:900}`; literals in007, not arbitrary Admin breakpoints.
- `sectionOrder:UUID[]`; nonempty, max40.
- `sections:Record<UUID,Section>` and `nodes:Record<UUID,Leaf>`; map keys equal entity IDs.
- `background:Background` from existing asset/solid contract.

`Section` has `id,label,hidden,background,flowNodeIds,artworkNodeIds,mobile,desktop`. Each leaf appears exactly once in a section role list. All IDs are unique/reachable, order explicit. Section nesting, linkedNodes and runtime editor fields forbidden.

## Layout rules

`mobile` is a complete rule; `desktop` is a strict partial override merged property-by-property, including nested edge padding, before render. Absent desktop properties inherit mobile. Defaults are materialized by authoring before persistence, not inferred differently in each app.

Section rule fields:

| Field          | Allowed values / constraint                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| layout         | `stack` or `grid`                                                                                      |
| columns        | 1 mobile; 1 or2 desktop; stack requires1                                                               |
| contentPreset  | `full`, `information`, `story`, `form`, `custom`                                                       |
| customMaxWidth | required key: integer200–900 for custom, null for all other presets; always bounded by available width |
| padding        | four integer CSS-pixel edges0–128                                                                      |
| gap            | integer0–128                                                                                           |
| minHeight      | integer0–12000; actual height remains auto                                                             |
| align          | start/center/end; container alignment, no reading-order reversal                                       |

Proposed authoring defaults: full takes available width; information width88% max420 mobile/max560 desktop; story max480 mobile/max640 desktop; form width100% max400; custom width100% with customMaxWidth. Grid children min-width:0; all presets bounded by section inner width after padding. Hero can use full/background and minHeight; controls remain intrinsic. Spacing choices shown by authoring follow MASTER scale, although validator bounds allow retained template choices.

## Leaf rules

`Leaf` has `id,type,content,bindings,appearance,custom,hidden,role,mobile,desktop`. Types/content/binding and custom metadata use existing catalog semantics without v1 box/parent/ROOT runtime structure.

- `role:flow`: mobile.layout rule `{widthPercent,maxWidth,align}`; widthPercent integer1–100, maxWidth integer1–900 ornull, align start/center/end. Desktop.layout overrides allow only these fields; desktop.typography and desktop.appearance use the allowlists below. No x/y/rotation/fixed height/absolute position for content.
- `role:artwork`: type only Image/Decoration/Shape; mobile.layout geometry `{xPercent,yPercent,widthPercent,aspectRatio,rotation}` with x/y−100–200, width1–200, aspectRatio0.1–10, rotation−180–180; section border box is coordinate space. It does not contribute flow height or accept input. Decorative overflow clips in separate artwork layer only.
- Typography override allowlist: fontSize8–96, lineHeight1–3, letterSpacing−5–20, textAlign left/center/right/justify. Base TextStyle retains supported font IDs/weights/colors; schema validates applicability by type. No desktop string/content/binding override.
- Appearance override allowlist: padding edges0–128 and borderRadius0–128 for eligible flow nodes. Asset/background stays base shared property in007. All other appearance validation stays with existing property matrix.
- `hidden` hides globally; no breakpoint visibility or CSS display override in007. This keeps reading order/widget identity simple and avoids separate layout data.
- Image flow content adds a v2-only `aspectRatio`0.1–10 for deterministic reserved space, required `alt` plain string1–300 after trim for meaningful flow images; no additions to v1 content shape. Existing fit/focal position/asset binding reused. Decoration alt is empty. Widgets/controls/text height auto; QR output retains usable module sizing.

Arrays and object keys are strict. Schema version2 does not permit unrestricted CSS, markup, urls, responsive content differences or arbitrary breakpoint declarations. Document bytes and node/widget caps from data-model apply.

## Resolution

Normalize WeddingData1 using existing semantics. Resolve all bindings once, apply optional/fallback logic, retain IDs/order and both rule sets. A section globally hidden is removed; an optional leaf without content is removed; sections with no resolved flow leaves are removed. A section required data issue blocks publish; hiding entire section is an explicit Admin decision.

`ResolvedSceneV2` strict fields: `schemaVersion:2, rendererContractVersion:2, viewport, background, sectionOrder, sections, nodes`. Resolved section shape retains layout/order/background; resolved leaf retains identity/type/role/layout/appearance and resolved content only, no bindings/custom editor fields. UUIDs align to source diagnostics. Scene asset references are IDs; delivery URLs live in RenderContext. No width-specific duplicated content. Runtime asOf/invitation/validationState stay in RenderContext as before.

Resolver results preserve existing issue/visibleAssetIds/hasVisibleRsvp semantics. V2 semantic issues include sectionId where relevant. Validation corpus must prove FE/API exact resolved output equality for same data/asOf.

## Exact nested shape and merge semantics

The following notation defines persisted fields, not implementation code. Every key without `?` is required; objects reject unknown keys. `Partial` allows only the listed properties; it does not allow arbitrary JSON. Empty override objects are valid and explicit. Existing content/appearance/binding validators are defined by feature004 `contracts/document-format.md` and the local component/property matrix.

```typescript
type Edges = { top: number; right: number; bottom: number; left: number };
type TypographyOverride = Partial<{
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textAlign: 'left' | 'center' | 'right' | 'justify';
}>;
type AppearanceOverride = { padding?: Partial<Edges>; borderRadius?: number };
type FlowLayout = {
  widthPercent: number;
  maxWidth: number | null;
  align: 'start' | 'center' | 'end';
};
type ArtworkLayout = {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  aspectRatio: number;
  rotation: number;
};
type FlowMobile = {
  layout: FlowLayout;
  typography: TypographyOverride;
  appearance: AppearanceOverride;
};
type FlowDesktop = {
  layout?: Partial<FlowLayout>;
  typography?: TypographyOverride;
  appearance?: AppearanceOverride;
};
type ArtworkMobile = { layout: ArtworkLayout };
type ArtworkDesktop = { layout?: Partial<ArtworkLayout> };
type SectionRule = {
  layout: 'stack' | 'grid';
  columns: 1 | 2;
  contentPreset: 'full' | 'information' | 'story' | 'form' | 'custom';
  customMaxWidth: number | null;
  padding: Edges;
  gap: number;
  minHeight: number;
  align: 'start' | 'center' | 'end';
};
type SectionDesktop = Partial<Omit<SectionRule, 'padding'>> & {
  padding?: Partial<Edges>;
};
type Section = {
  id: UUID;
  label: string;
  hidden: boolean;
  background: Background;
  flowNodeIds: UUID[];
  artworkNodeIds: UUID[];
  mobile: SectionRule;
  desktop: SectionDesktop;
};
type LeafCommon<K extends ComponentName> = {
  id: UUID;
  type: K;
  content: ContentV2[K];
  bindings: Binding[];
  appearance: Appearance;
  custom: { layerName: string; locked: boolean; optional: boolean };
  hidden: boolean;
};
type FlowLeaf<K extends ComponentName> = LeafCommon<K> & {
  role: 'flow';
  mobile: FlowMobile;
  desktop: FlowDesktop;
};
type ArtworkLeaf<K extends 'Image' | 'Decoration' | 'Shape'> = LeafCommon<K> & {
  role: 'artwork';
  mobile: ArtworkMobile;
  desktop: ArtworkDesktop;
};
type ResolvedSection = Omit<Section, 'label' | 'hidden'>;
type ResolvedLeaf<K extends ComponentName> = Omit<
  Leaf<K>,
  'bindings' | 'custom' | 'hidden' | 'content'
> & {
  content: ResolvedContentV2[K];
};
```

`Leaf<K>` is the type-correct flow/artwork discriminated union; artwork is forbidden for other kinds. `ContentV2` reuses existing content by kind, with only Image flow requiring `aspectRatio` and nonempty `alt`; artwork Image/Decoration uses image content plus empty `alt` and layout.aspectRatio, never flow aspectRatio. Decoration in flow uses image content with aspectRatio and empty alt. `ResolvedContentV2` preserves these role-specific image additions and uses the existing resolved widget content catalog. Binding array cardinality/applicability/fallback validation stays identical to004. `Appearance` keys remain type-specific by existing PROPERTY_MATRIX; unsupported styling is rejected, not ignored. Section label and custom.layerName are trimmed strings1–120.

Merge order for flow style is base `content.textStyle`/`appearance` → mobile.typography/mobile.appearance → desktop.typography/desktop.appearance when host>=768. Merge nested padding edge-by-edge; arrays are never merged; null maxWidth is explicit, never inherited. Complete mobile.layout merges desktop.layout property-by-property. Artwork uses layout only, no typography/appearance overrides. A node with no applicable textStyle requires empty typography object and rejects nonempty overrides. Padding/radius overrides require the matching PROPERTY_MATRIX eligibility.

Section desktop inheritance must validate the effective rule: mobile columns1; stack columns1 in either layout; non-custom preset requires customMaxWidth:null. Switching to custom needs a valid customMaxWidth in the effective rule; switching away from custom must explicitly clear it. All numbers finite and within bounds above; overflow/clipping/target rules remain publication validations, not relaxed by valid schema.

Resolved scene.sections contains exactly retained section IDs in sectionOrder. Each resolved section retains `id,background,flowNodeIds,artworkNodeIds,mobile,desktop`; each resolved node retains exactly `id,type,content,appearance,role,mobile,desktop`. No hidden/editor metadata/box/parent fields remain. Preserve override objects without applying a width-specific merge during resolution. No retained flow sections gives DOCUMENT_INVALID with issue code EMPTY_SCENE; malformed reference/role/layout gives DOCUMENT_INVALID; unknown schema/renderer pair gives UNSUPPORTED_SCHEMA; required/type binding failures retain existing BINDING_INVALID issue codes. Structural diagnostics use `/sections/<UUID>/...` or `/nodes/<UUID>/...` with sectionId/nodeId when applicable.

### Concrete merge example

```json
{
  "role": "flow",
  "mobile": {
    "layout": { "widthPercent": 100, "maxWidth": null, "align": "center" },
    "typography": { "fontSize": 20, "lineHeight": 1.5 },
    "appearance": { "padding": { "left": 8, "right": 8 } }
  },
  "desktop": {
    "layout": { "maxWidth": 560 },
    "typography": { "fontSize": 26 },
    "appearance": { "padding": { "left": 16 } }
  }
}
```

This is a partial leaf illustrating the nested fields, not a full valid document. Desktop keeps widthPercent100, align center, lineHeight1.5 and right padding8; replaces maxWidth/fontSize/left padding. Remaining padding edges inherit the validated base appearance. Tests T010 must include full valid documents and exact expected resolved scenes using this shape.

## Asset identity across layouts

007 has no breakpoint-specific assetId, background or visibility. Both layouts render the same resolved asset set; layout only changes geometry/style. Retention for editable draft and immutable revisions/jobs includes all authorized authored references (including hidden nodes and binding fallbacks) to preserve future edits. Public delivery allowlist comes only from resolved reachable sections/nodes/background/artwork after pruning, not the broader draft retention set. Removing a hidden/pruned asset from public access does not authorize cleanup while a retained draft/revision/job references it. Test nested assets/fallbacks and race protection at both widths, not an unrepresentable desktop-only asset fixture.
