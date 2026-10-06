# TemplateDesign and WeddingData Contract v1

Normative contract for independent API/web validators and fixtures. Unknown fields, non-finite values, prototype keys, arbitrary HTML/CSS, external resource URLs and unlisted node types are rejected. Draft incompleteness is distinct from malformed data. No customer endpoint accepts TemplateDesign.

## Canonical document

```text
TemplateDesign = { schemaVersion: 1, nodes: Record<NodeId, SerializedNode> }
NodeId = "ROOT" | UUID
SerializedNode = {
  type: { resolvedName: ComponentName }, isCanvas: boolean,
  props: RootProps | ElementProps, displayName: string,
  custom: RootCustom | ElementCustom, hidden: boolean,
  parent?: "ROOT", nodes: NodeId[], linkedNodes: {}
}
RootProps = { canvas: { width: 390, height: number, background: Background } }
RootCustom = {}
ElementCustom = { layerName: string, locked: boolean, optional: boolean }
ElementProps = { box: Box, appearance: Appearance, content: KindContent, bindings: Binding[] }
Box = { x: number, y: number, width: number, height: number, rotation: number }
```

ROOT type is `InvitationCanvas`, isCanvas true, hidden false, no parent. Children have parent ROOT, isCanvas false, empty nodes/linkedNodes; each appears exactly once in ROOT.nodes. No orphan/cycle/nesting is valid. `displayName` is the stable component name; editable layer label lives only in custom.layerName (1–80 chars). Root order is back-to-front; panel numeric layer and z-index are derived, not separately persisted. Component names: Text, Image, Decoration, Shape, Calendar, Countdown, Map, RSVP, QRBank, Timeline.

Defaults: root height 1600, background solid #FFFFFFFF; child locked/hidden/optional false, rotation 0, opacity 1. Assign UUIDs on all element creation/duplication paths instead of Craft default random IDs. Use explicit to/from-Craft adapters: export omits ROOT.parent (Craft represents it as null); import restores that null and exact persisted IDs. Raw query.serialize() is not the wire format without normalization. UUIDs are regenerated for duplicate elements/templates; internal node ID references are remapped. Template duplicate excludes published state/history and retains authorized asset references.

Bounds: ≤200 child nodes including ≤30 widgets; document UTF-8 JSON ≤1,048,576 bytes. Height integer 390–12000. Box width/height 1–12000, x/y finite in ±12000, rotation normalized to [-180,180), position/size rounded to 0.01 canonical px when committing a gesture. Rotated frame outside canvas is allowed in draft, blocked at publication for visible elements. Canvas dimensions and transform math are never derived from saved viewport dimensions. Editor zoom/selection/hover and resolved content are not serialized.

## Appearance and property applicability

| Property | Contract |
|----------|----------|
| opacity | number 0–1, all elements |
| background | `{kind:"solid",color:HexRGBA}` or `{kind:"asset",assetId:UUID,fit:"cover"\|"contain",positionX:0..1,positionY:0..1}`; root and non-image elements |
| border | `{width:0..20,color:HexRGBA,style:"solid"\|"dashed"\|"dotted"}`; all elements |
| borderRadius | number 0–600; all except Shape line, circle derives radius from frame |
| shadow | null or `{offsetX:-100..100,offsetY:-100..100,blur:0..100,spread:-50..50,color:HexRGBA}`; all elements |
| padding | `{top,right,bottom,left}` each 0–100, must leave a positive content box; Text/widgets, not Image/Decoration/Shape |

HexRGBA is exactly `#RRGGBBAA`; transparent is explicit, no CSS strings/functions/URLs. Inapplicable property fields are absent, not ignored. Shape stroke uses border; no additional competing stroke state. Text and all widgets support the TextStyle fields below; image/shape do not. An optional one-color background on an image is represented by a separate Shape, not undocumented appearance behavior.

```text
TextStyle = {
  fontId: "noto-sans-v1" | "noto-serif-v1",
  fontSize: 8..160, fontWeight: 400 | 700,
  italic: boolean, underline: boolean, color: HexRGBA,
  letterSpacing: -5..20, lineHeight: 0.8..3,
  textAlign: "left" | "center" | "right" | "justify",
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize"
}
```

Line height is a multiplier, letter spacing in canonical px. Defaults: Noto Sans, 18 px, 400, lineHeight 1.5, left, black, remaining flags false/none/0. Plain text only, Unicode preserved, newlines supported. Fonts include regular/bold/italic/bold-italic; unsupported weights are not simulated. Shape primitives: rectangle, ellipse, line (line uses frame center and border). Image/Decoration content contains assetId, fit cover/contain and normalized positionX/positionY (default 0.5). No crop transformation or destructive pixel editing.

## Content and widget defaults

| Type | Content / editable settings | Default frame width × height |
|------|-----------------------------|------------------------------|
| Text | text ≤5000 chars, TextStyle | 300×80 |
| Image | assetId nullable until selected, fit/position | 240×180 |
| Decoration | same asset contract as Image, alpha preserved | 120×120 |
| Shape | primitive rectangle/ellipse/line, fill color | 120×120 |
| Calendar | TextStyle, accentColor; Gregorian month with selected event date | 350×320 |
| Countdown | TextStyle, label and endedLabel ≤120 chars | 350×120 |
| Map | TextStyle, label ≤120; generated map + venue/address/link | 350×320 |
| RSVP | TextStyle, title/closedLabel/successLabel ≤120; fixed Vietnamese field labels | 350×640 |
| QRBank | TextStyle, label ≤120; QR + account/name text | 300×360 |
| Timeline | TextStyle, accentColor; ordered timeline entries | 350×480 |

The TextStyle field in the table is always stored as `content.textStyle`, not flattened into appearance. Remaining listed editable keys are direct content keys. New Text content defaults to "Văn bản"; RSVP defaults use Vietnamese title/closed/success labels from a versioned fixture; image assetId starts null. All new elements start x=20,y=20; dimensions can be resized, and fit is checked at publish. Calendar/Countdown/Map require a corresponding typed binding, not customer values in content. Binding.eventKey is the sole event selector, never duplicated in content. It selects one of `ceremony`, `reception`, `engagement`, `afterParty`; only selected event sections appear in customer form. Calendar shows the entire month with Monday first and Vietnamese labels; Countdown has fixed day/hour/minute/second cells with 4-digit day capacity, zeroes+endedLabel after expiration. Timeline respects saved array order, no automatic sort or repeat engine. RSVP has exactly one effective invitation context even if multiple widgets exist; all show the same open/closed state.

MVP supports static display, no animation property. Widget appearance cannot override QR's white quiet zone or contrast: black modules on white with minimum four-module margin. Validate QR frame large enough for readable code, at least 180 canonical px for the symbol excluding text.

## BindingDefinition

```text
Binding = {
  target: AllowedTargetForComponent,
  source: CatalogField,
  eventKey?: "ceremony" | "reception" | "engagement" | "afterParty",
  fallback?: ValueMatchingSourceType
}
```

Each target appears once. Absence of binding uses static content where supported (Text/Image/Decoration); bind selection disables editing the corresponding static value except as explicit fallback. Registry defines essential versus auxiliary inputs; users do not invent required flags for internal widget fields.

| Component target | Source catalog / type |
|------------------|-----------------------|
| Text.text | bride.name, groom.name, parents.bride.fatherName/motherName, parents.groom.fatherName/motherName, story — string |
| Text.text | wedding.date, wedding.time, venue.name, venue.address — event-derived formatted string; eventKey required |
| Image/Decoration.assetId | bride.photo, groom.photo, couple.photo — asset ID |
| Calendar/Countdown.event | wedding.event — Event object; eventKey required |
| Map.venue | venue — Venue object; eventKey required |
| QRBank.bank | bank — Bank object |
| Timeline.entries | timeline — array of TimelineEntry |
| RSVP | no WeddingData binding; runtime context only |

Dates use event timezone, `vi-VN`, date `dd/MM/yyyy`, time `HH:mm`; no arbitrary formatter language. Dotted catalog fields above are allowlisted identifiers, not arbitrary property traversal. Gallery/repeaters are not supported. Default sample data comes from an explicit fixture and is never an implicit fallback on public pages.

Resolution: validate types first; manually hidden elements do not render but malformed values remain invalid. For each binding select data, else use its complete explicit fallback on null/undefined/trim-empty string/empty array or a composite value missing essential inputs. Do not merge fields from partially supplied customer data with fallback fields. Validate supplied values before fallback; malformed values cannot be hidden by fallback. An event absent is missing, an invalid datetime is wrong type/value. If any essential resolved input is absent: optional element → hide entire element; required element → publish error. Auxiliary fields such as bank.message may be empty. Hidden nodes keep their original box and do not shrink canvas; no mutation of Craft.hidden from resolution. Derived visibility is recomputed per dataset. Essential inputs: Calendar/Countdown require datetime and timeZone; Map requires venue name/address/latitude/longitude; QRBank requires bin/account/recipientName; Timeline requires at least one valid entry; Text requires nonempty text, Image/Decoration an asset ID. Partial objects such as bank:{} count as missing essential inputs, not type errors. RSVP needs runtime invitation context in public mode only. Draft form labels identify optional fields; all essential fields for required visible elements are marked required.

## WeddingData v1

```text
WeddingData = {
  schemaVersion: 1,
  bride?: { name?: string, photo?: UUID },
  groom?: { name?: string, photo?: UUID },
  couple?: { photo?: UUID },
  parents?: {
    bride?: { fatherName?: string, motherName?: string },
    groom?: { fatherName?: string, motherName?: string }
  },
  story?: string,
  events?: Partial<Record<EventKey,Event>>,
  timeline?: TimelineEntry[],
  bank?: Bank
}
Event = { datetime?: ISO8601WithOffset, timeZone?: IANATimeZone, venue?: Venue }
Venue = { name?: string, address?: string, latitude?: number, longitude?: number }
TimelineEntry = { id: UUID, title: string, description?: string, dateLabel?: string }
Bank = { bin?: string, account?: string, recipientName?: string, message?: string }
```

≤256 KiB UTF-8 JSON. Names ≤120 Unicode code points; story ≤5000; venue address ≤500; max 20 timeline entries with unique IDs, title ≤120, description ≤500, dateLabel ≤80. Trim outer whitespace while preserving inner whitespace/newlines. Array order is display order. Optional fields may be absent or normalized null-to-absent; reject unknown keys. Drafts may be incomplete, but any supplied typed value must validate.

Datetime contains explicit offset consistent with IANA timezone at that instant; reject invalid/nonexistent local time and inconsistent offset. Form defaults timezone to Asia/Ho_Chi_Minh and collects date/time together; dates stay explicit and are not inferred from viewer clock. Supported years 1900–2100; Countdown publish requires date within its 4-digit day capacity. Venue lat [-90,90], lng [-180,180]; Map requires both coordinates plus name/address. Text-only venue bindings do not force coordinates. No geocoding or pasted HTML iframe input.

Bank validation: reviewed allowlisted 6-digit BIN; account 6–19 digits kept as string; recipientName 5–50 Unicode code points; optional message ≤25 `[A-Za-z0-9 ]` characters. Partial bank object may be saved in draft but visible QR needs all essential values. No silent stripping of leading zeroes, transliteration of recipient display name or truncation.

Admin sample data follows the same structure/validation, using bundled licensed fixture assets only. Customer form is generated from binding catalog, grouping duplicate field requirements; static template elements add no inputs. All persisted custom image IDs must pass scope/ownership checks, including fallback and invisible fields.

## ResolvedScene and runtime context

```text
ResolvedScene = {
  schemaVersion: 1, rendererContractVersion: 1,
  canvas: {width:390,height:number,background:Background},
  elements: {id:UUID,type:ComponentName,box:Box,appearance:Appearance,
             content:ResolvedKindContent}[]
}
RenderContext = {
  mode: "editor" | "preview" | "capture" | "public",
  asOf: ISO8601Instant,
  invitation?: {slug:UUID,publicVersion:number,rsvpOpen:boolean},
  assetUrls: Record<UUID,string>
}
```

ResolvedKindContent preserves the original static content keys and textStyle, replaces Text.text or Image/Decoration.assetId with resolved values, adds `event:{datetime,timeZone}` to Calendar/Countdown, `venue:Venue` to Map, `entries:TimelineEntry[]` to Timeline and `bank:Bank,qrPayload:string` to QRBank. QR payload is produced by API's narrow validated codec; web uses qrcode to produce modules rendered as safe SVG primitives, without arbitrary HTML injection or persisted Base64. Editor local preview codec must match the same golden vectors. RSVP content contains labels/textStyle only; public state comes from context. Scene order is authoritative. Omit hidden elements, bindings, unused WeddingData, layer locks/names, owner IDs and audit metadata. Runtime event fields necessary for Countdown/Calendar/Map and bank fields actually displayed are permitted. Asset URLs are generated by trusted runtime, never copied from design/data. API computes scene and effective RSVP presence before publication; renderer consumes that scene, not a second private data resolver. Editor/preview run equivalent local resolution validated against the shared corpus.

Template thumbnails use sample scene; invitation capture uses candidate real scene. No persisted scene embeds private storage URLs or temporary authorization. Context supplies URLs only after scope checks. Public code imports display components without Craft/history/editor bundles.

## Required contract corpus

Implementation creates fixture JSON files for every element/property/binding; empty and maximum document; serialize-deserialize-round-trip; every rejected component/tree/URL/type; optional absent/fallback/partial/wrong-type/manual-hide combinations; multiple event keys/timezones; hidden RSVP; QR vector; Vietnamese diacritics/long text. API and web suites read the same non-runtime fixture corpus and assert matching validation/resolution. Differences fail tests; neither application imports the other's runtime code.
