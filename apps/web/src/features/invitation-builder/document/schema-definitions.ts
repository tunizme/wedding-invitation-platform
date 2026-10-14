// Web-owned Zod definitions for primitive projection validation; verify changes against the shared corpus.

import { z } from 'zod';

const text = (max: number, min = 0) =>
  z
    .string()
    .refine(
      (value) => [...value].length >= min && [...value].length <= max,
      'STRING_LENGTH',
    );

const field_background: z.ZodType = z.union([
  z.strictObject({
    kind: z.literal('solid'),
    color: z
      .string()
      .refine(
        (value) => new RegExp('^#[0-9A-Fa-f]{8}$').test(value),
        'STRING_FORMAT',
      ),
  }),
  z.strictObject({
    kind: z.literal('asset'),
    assetId: z
      .string()
      .refine(
        (value) =>
          new RegExp(
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ).test(value),
        'STRING_FORMAT',
      ),
    fit: z.enum(['cover', 'contain']),
    positionX: z.number().min(0).max(1),
    positionY: z.number().min(0).max(1),
  }),
]);

const field_root: z.ZodType = z.strictObject({
  type: z.strictObject({ resolvedName: z.literal('InvitationCanvas') }),
  isCanvas: z.literal(true),
  displayName: z.literal('InvitationCanvas'),
  custom: z.strictObject({}),
  hidden: z.literal(false),
  linkedNodes: z.strictObject({}),
  nodes: z
    .array(
      z
        .string()
        .refine(
          (value) =>
            new RegExp(
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            ).test(value),
          'STRING_FORMAT',
        ),
    )
    .max(200)
    .refine((value) => new Set(value).size === value.length, 'DUPLICATE_ID'),
  props: z.strictObject({
    canvas: z.strictObject({
      width: z.literal(390),
      height: z.number().int().min(390).max(12000),
      background: field_background,
    }),
  }),
});

const field_box: z.ZodType = z.strictObject({
  x: z.number().min(-12000).max(12000),
  y: z.number().min(-12000).max(12000),
  width: z.number().min(1).max(12000),
  height: z.number().min(1).max(12000),
  rotation: z.number().min(-180).lt(180),
});

const field_border: z.ZodType = z.strictObject({
  width: z.number().min(0).max(20),
  color: z
    .string()
    .refine(
      (value) => new RegExp('^#[0-9A-Fa-f]{8}$').test(value),
      'STRING_FORMAT',
    ),
  style: z.enum(['solid', 'dashed', 'dotted', 'double']),
  position: z
    .enum([
      'all',
      'top',
      'right',
      'bottom',
      'left',
      'vertical',
      'horizontal',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ])
    .optional(),
});

const field_textShadow: z.ZodType = z.strictObject({
  offsetX: z.number().min(-100).max(100),
  offsetY: z.number().min(-100).max(100),
  blur: z.number().min(0).max(100),
  color: z
    .string()
    .refine(
      (value) => new RegExp('^#[0-9A-Fa-f]{8}$').test(value),
      'STRING_FORMAT',
    ),
});

const field_shadow: z.ZodType = z.union([
  z.strictObject({
    offsetX: z.number().min(-100).max(100),
    offsetY: z.number().min(-100).max(100),
    blur: z.number().min(0).max(100),
    spread: z.number().min(-100).max(100),
    color: z
      .string()
      .refine(
        (value) => new RegExp('^#[0-9A-Fa-f]{8}$').test(value),
        'STRING_FORMAT',
      ),
  }),
  z.null(),
]);

const field_cornerRadii = z.strictObject({
  topLeft: z.number().min(0).max(600),
  topRight: z.number().min(0).max(600),
  bottomRight: z.number().min(0).max(600),
  bottomLeft: z.number().min(0).max(600),
});

const field_padding: z.ZodType = z.strictObject({
  top: z.number().min(0).max(100),
  right: z.number().min(0).max(100),
  bottom: z.number().min(0).max(100),
  left: z.number().min(0).max(100),
});

const field_textStyle: z.ZodType = z.strictObject({
  fontId: z.enum(['noto-sans-v1', 'noto-serif-v1']),
  fontSize: z.number().min(8).max(160),
  fontWeight: z.union([z.literal(400), z.literal(700)]),
  italic: z.boolean(),
  underline: z.boolean(),
  strike: z.boolean().optional(),
  textShadow: field_textShadow.optional(),
  color: z
    .string()
    .refine(
      (value) => new RegExp('^#[0-9A-Fa-f]{8}$').test(value),
      'STRING_FORMAT',
    ),
  letterSpacing: z.number().min(-5).max(100),
  lineHeight: z.number().min(0.5).max(3),
  textAlign: z.enum(['left', 'center', 'right', 'justify']),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']),
});

const field_Text: z.ZodType = z.strictObject({
  hidden: z.boolean(),
  nodes: z.array(z.never()).max(0),
  linkedNodes: z.strictObject({}),
  type: z.strictObject({ resolvedName: z.literal('Text') }),
  isCanvas: z.literal(false),
  displayName: z.literal('Text'),
  parent: z.literal('ROOT'),
  custom: z.strictObject({
    layerName: text(80, 1),
    locked: z.boolean(),
    optional: z.boolean(),
  }),
  props: z.strictObject({
    box: field_box,
    appearance: z.strictObject({
      opacity: z.number().min(0).max(1),
      border: field_border,
      shadow: field_shadow,
      borderRadius: z.number().min(0).max(600).optional(),
      borderRadii: field_cornerRadii.optional(),
      background: field_background,
      padding: field_padding,
    }),
    content: z.strictObject({
      text: text(5000, 0),
      textStyle: field_textStyle,
    }),
    bindings: z
      .array(
        z.union([
          z.strictObject({
            target: z.literal('text'),
            source: z.enum([
              'bride.name',
              'groom.name',
              'parents.bride.fatherName',
              'parents.bride.motherName',
              'parents.groom.fatherName',
              'parents.groom.motherName',
              'story',
            ]),
            fallback: text(5000, 0).optional(),
          }),
          z.strictObject({
            target: z.literal('text'),
            source: z.enum([
              'wedding.date',
              'wedding.time',
              'venue.name',
              'venue.address',
            ]),
            fallback: text(5000, 0).optional(),
            eventKey: z.enum([
              'ceremony',
              'reception',
              'engagement',
              'afterParty',
            ]),
          }),
        ]),
      )
      .max(1),
  }),
});

const field_Image: z.ZodType = z.strictObject({
  hidden: z.boolean(),
  nodes: z.array(z.never()).max(0),
  linkedNodes: z.strictObject({}),
  type: z.strictObject({ resolvedName: z.literal('Image') }),
  isCanvas: z.literal(false),
  displayName: z.literal('Image'),
  parent: z.literal('ROOT'),
  custom: z.strictObject({
    layerName: text(80, 1),
    locked: z.boolean(),
    optional: z.boolean(),
  }),
  props: z.strictObject({
    box: field_box,
    appearance: z.strictObject({
      opacity: z.number().min(0).max(1),
      border: field_border,
      shadow: field_shadow,
      borderRadius: z.number().min(0).max(600).optional(),
      borderRadii: field_cornerRadii.optional(),
    }),
    content: z.strictObject({
      assetId: z.union([
        z
          .string()
          .refine(
            (value) =>
              new RegExp(
                '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
              ).test(value),
            'STRING_FORMAT',
          ),
        z.null(),
      ]),
      fit: z.enum(['cover', 'contain']),
      positionX: z.number().min(0).max(1),
      positionY: z.number().min(0).max(1),
    }),
    bindings: z
      .array(
        z.strictObject({
          target: z.literal('assetId'),
          source: z.enum(['bride.photo', 'groom.photo', 'couple.photo']),
          fallback: z
            .string()
            .refine(
              (value) =>
                new RegExp(
                  '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
                ).test(value),
              'STRING_FORMAT',
            )
            .optional(),
        }),
      )
      .max(1),
  }),
});

const field_Decoration: z.ZodType = z.strictObject({
  hidden: z.boolean(),
  nodes: z.array(z.never()).max(0),
  linkedNodes: z.strictObject({}),
  type: z.strictObject({ resolvedName: z.literal('Decoration') }),
  isCanvas: z.literal(false),
  displayName: z.literal('Decoration'),
  parent: z.literal('ROOT'),
  custom: z.strictObject({
    layerName: text(80, 1),
    locked: z.boolean(),
    optional: z.boolean(),
  }),
  props: z.strictObject({
    box: field_box,
    appearance: z.strictObject({
      opacity: z.number().min(0).max(1),
      border: field_border,
      shadow: field_shadow,
      borderRadius: z.number().min(0).max(600).optional(),
      borderRadii: field_cornerRadii.optional(),
    }),
    content: z.strictObject({
      assetId: z.union([
        z
          .string()
          .refine(
            (value) =>
              new RegExp(
                '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
              ).test(value),
            'STRING_FORMAT',
          ),
        z.null(),
      ]),
      fit: z.enum(['cover', 'contain']),
      positionX: z.number().min(0).max(1),
      positionY: z.number().min(0).max(1),
    }),
    bindings: z
      .array(
        z.strictObject({
          target: z.literal('assetId'),
          source: z.enum(['bride.photo', 'groom.photo', 'couple.photo']),
          fallback: z
            .string()
            .refine(
              (value) =>
                new RegExp(
                  '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
                ).test(value),
              'STRING_FORMAT',
            )
            .optional(),
        }),
      )
      .max(1),
  }),
});

const field_Shape: z.ZodType = z.strictObject({
  hidden: z.boolean(),
  nodes: z.array(z.never()).max(0),
  linkedNodes: z.strictObject({}),
  type: z.strictObject({ resolvedName: z.literal('Shape') }),
  isCanvas: z.literal(false),
  displayName: z.literal('Shape'),
  parent: z.literal('ROOT'),
  custom: z.strictObject({
    layerName: text(80, 1),
    locked: z.boolean(),
    optional: z.boolean(),
  }),
  props: z.strictObject({
    box: field_box,
    appearance: z.strictObject({
      opacity: z.number().min(0).max(1),
      border: field_border,
      shadow: field_shadow,
      borderRadius: z.number().min(0).max(600).optional(),
      borderRadii: field_cornerRadii.optional(),
      background: field_background,
    }),
    content: z.strictObject({
      primitive: z.enum(['rectangle', 'ellipse', 'triangle', 'line']),
      fill: z
        .string()
        .refine(
          (value) => new RegExp('^#[0-9A-Fa-f]{8}$').test(value),
          'STRING_FORMAT',
        ),
    }),
    bindings: z.array(z.never()).max(1),
  }),
});

const field_venue: z.ZodType = z.strictObject({
  name: text(120, 0).optional(),
  address: text(500, 0).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

const field_event: z.ZodType = z.strictObject({
  datetime: text(40, 0).optional(),
  timeZone: text(100, 0).optional(),
  venue: field_venue.optional(),
});

const field_Calendar: z.ZodType = z.strictObject({
  hidden: z.boolean(),
  nodes: z.array(z.never()).max(0),
  linkedNodes: z.strictObject({}),
  type: z.strictObject({ resolvedName: z.literal('Calendar') }),
  isCanvas: z.literal(false),
  displayName: z.literal('Calendar'),
  parent: z.literal('ROOT'),
  custom: z.strictObject({
    layerName: text(80, 1),
    locked: z.boolean(),
    optional: z.boolean(),
  }),
  props: z.strictObject({
    box: field_box,
    appearance: z.strictObject({
      opacity: z.number().min(0).max(1),
      border: field_border,
      shadow: field_shadow,
      borderRadius: z.number().min(0).max(600).optional(),
      borderRadii: field_cornerRadii.optional(),
      background: field_background,
      padding: field_padding,
    }),
    content: z.strictObject({
      variant: z.enum(['classic', 'minimal', 'filled']).optional(),
      textStyle: field_textStyle,
      accentColor: z
        .string()
        .refine(
          (value) => new RegExp('^#[0-9A-Fa-f]{8}$').test(value),
          'STRING_FORMAT',
        ),
    }),
    bindings: z
      .array(
        z.strictObject({
          target: z.literal('event'),
          source: z.enum(['wedding.event']),
          fallback: field_event.optional(),
          eventKey: z.enum([
            'ceremony',
            'reception',
            'engagement',
            'afterParty',
          ]),
        }),
      )
      .max(1),
  }),
});

const field_Countdown: z.ZodType = z.strictObject({
  hidden: z.boolean(),
  nodes: z.array(z.never()).max(0),
  linkedNodes: z.strictObject({}),
  type: z.strictObject({ resolvedName: z.literal('Countdown') }),
  isCanvas: z.literal(false),
  displayName: z.literal('Countdown'),
  parent: z.literal('ROOT'),
  custom: z.strictObject({
    layerName: text(80, 1),
    locked: z.boolean(),
    optional: z.boolean(),
  }),
  props: z.strictObject({
    box: field_box,
    appearance: z.strictObject({
      opacity: z.number().min(0).max(1),
      border: field_border,
      shadow: field_shadow,
      borderRadius: z.number().min(0).max(600).optional(),
      borderRadii: field_cornerRadii.optional(),
      background: field_background,
      padding: field_padding,
    }),
    content: z.strictObject({
      textStyle: field_textStyle,
      label: text(120, 0),
      endedLabel: text(120, 0),
      layout: z.enum(['horizontal', 'vertical']).optional(),
      gap: z.number().min(0).max(40).optional(),
      frameColor: z
        .string()
        .refine(
          (value) => new RegExp('^#[0-9A-Fa-f]{8}$').test(value),
          'STRING_FORMAT',
        )
        .optional(),
    }),
    bindings: z
      .array(
        z.strictObject({
          target: z.literal('event'),
          source: z.enum(['wedding.event']),
          fallback: field_event.optional(),
          eventKey: z.enum([
            'ceremony',
            'reception',
            'engagement',
            'afterParty',
          ]),
        }),
      )
      .max(1),
  }),
});

const field_Map: z.ZodType = z.strictObject({
  hidden: z.boolean(),
  nodes: z.array(z.never()).max(0),
  linkedNodes: z.strictObject({}),
  type: z.strictObject({ resolvedName: z.literal('Map') }),
  isCanvas: z.literal(false),
  displayName: z.literal('Map'),
  parent: z.literal('ROOT'),
  custom: z.strictObject({
    layerName: text(80, 1),
    locked: z.boolean(),
    optional: z.boolean(),
  }),
  props: z.strictObject({
    box: field_box,
    appearance: z.strictObject({
      opacity: z.number().min(0).max(1),
      border: field_border,
      shadow: field_shadow,
      borderRadius: z.number().min(0).max(600).optional(),
      borderRadii: field_cornerRadii.optional(),
      background: field_background,
      padding: field_padding,
    }),
    content: z.strictObject({
      textStyle: field_textStyle,
      label: text(120, 0),
    }),
    bindings: z
      .array(
        z.strictObject({
          target: z.literal('venue'),
          source: z.enum(['venue']),
          fallback: field_venue.optional(),
          eventKey: z.enum([
            'ceremony',
            'reception',
            'engagement',
            'afterParty',
          ]),
        }),
      )
      .max(1),
  }),
});

const field_RSVP: z.ZodType = z.strictObject({
  hidden: z.boolean(),
  nodes: z.array(z.never()).max(0),
  linkedNodes: z.strictObject({}),
  type: z.strictObject({ resolvedName: z.literal('RSVP') }),
  isCanvas: z.literal(false),
  displayName: z.literal('RSVP'),
  parent: z.literal('ROOT'),
  custom: z.strictObject({
    layerName: text(80, 1),
    locked: z.boolean(),
    optional: z.boolean(),
  }),
  props: z.strictObject({
    box: field_box,
    appearance: z.strictObject({
      opacity: z.number().min(0).max(1),
      border: field_border,
      shadow: field_shadow,
      borderRadius: z.number().min(0).max(600).optional(),
      borderRadii: field_cornerRadii.optional(),
      background: field_background,
      padding: field_padding,
    }),
    content: z.strictObject({
      textStyle: field_textStyle,
      title: text(120, 0),
      closedLabel: text(120, 0),
      successLabel: text(120, 0),
      nameLabel: text(120, 0).optional(),
      submitLabel: text(120, 0).optional(),
      buttonColor: z
        .string()
        .refine(
          (value) => new RegExp('^#[0-9A-Fa-f]{8}$').test(value),
          'STRING_FORMAT',
        )
        .optional(),
      buttonTextColor: z
        .string()
        .refine(
          (value) => new RegExp('^#[0-9A-Fa-f]{8}$').test(value),
          'STRING_FORMAT',
        )
        .optional(),
    }),
    bindings: z.array(z.never()).max(1),
  }),
});

const field_bank: z.ZodType = z.strictObject({
  bin: z
    .enum([
      '',
      '422589',
      '546034',
      '546035',
      '668888',
      '963388',
      '970400',
      '970403',
      '970405',
      '970407',
      '970409',
      '970412',
      '970414',
      '970415',
      '970416',
      '970418',
      '970419',
      '970422',
      '970423',
      '970424',
      '970425',
      '970426',
      '970427',
      '970428',
      '970429',
      '970430',
      '970431',
      '970432',
      '970433',
      '970436',
      '970437',
      '970438',
      '970440',
      '970441',
      '970443',
      '970446',
      '970448',
      '970449',
      '970452',
      '970454',
      '970457',
      '971025',
      '971133',
    ])
    .optional(),
  account: z
    .string()
    .refine(
      (value) => new RegExp('^(?:[0-9]{6,19})?$').test(value),
      'STRING_FORMAT',
    )
    .optional(),
  recipientName: z.union([z.literal(''), text(50, 5)]).optional(),
  message: text(25, 0)
    .refine(
      (value) => new RegExp('^[A-Za-z0-9 ]*$').test(value),
      'STRING_FORMAT',
    )
    .optional(),
});

const field_QRBank: z.ZodType = z.strictObject({
  hidden: z.boolean(),
  nodes: z.array(z.never()).max(0),
  linkedNodes: z.strictObject({}),
  type: z.strictObject({ resolvedName: z.literal('QRBank') }),
  isCanvas: z.literal(false),
  displayName: z.literal('QRBank'),
  parent: z.literal('ROOT'),
  custom: z.strictObject({
    layerName: text(80, 1),
    locked: z.boolean(),
    optional: z.boolean(),
  }),
  props: z.strictObject({
    box: field_box,
    appearance: z.strictObject({
      opacity: z.number().min(0).max(1),
      border: field_border,
      shadow: field_shadow,
      borderRadius: z.number().min(0).max(600).optional(),
      borderRadii: field_cornerRadii.optional(),
      background: field_background,
      padding: field_padding,
    }),
    content: z.strictObject({
      textStyle: field_textStyle,
      label: text(120, 0),
    }),
    bindings: z
      .array(
        z.strictObject({
          target: z.literal('bank'),
          source: z.enum(['bank']),
          fallback: field_bank.optional(),
        }),
      )
      .max(1),
  }),
});

const field_timelineEntry: z.ZodType = z.strictObject({
  id: z
    .string()
    .refine(
      (value) =>
        new RegExp(
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).test(value),
      'STRING_FORMAT',
    ),
  title: text(120, 1),
  description: text(500, 0).optional(),
  dateLabel: text(80, 0).optional(),
});

const field_timeline: z.ZodType = z.array(field_timelineEntry).max(20);

const field_Timeline: z.ZodType = z.strictObject({
  hidden: z.boolean(),
  nodes: z.array(z.never()).max(0),
  linkedNodes: z.strictObject({}),
  type: z.strictObject({ resolvedName: z.literal('Timeline') }),
  isCanvas: z.literal(false),
  displayName: z.literal('Timeline'),
  parent: z.literal('ROOT'),
  custom: z.strictObject({
    layerName: text(80, 1),
    locked: z.boolean(),
    optional: z.boolean(),
  }),
  props: z.strictObject({
    box: field_box,
    appearance: z.strictObject({
      opacity: z.number().min(0).max(1),
      border: field_border,
      shadow: field_shadow,
      borderRadius: z.number().min(0).max(600).optional(),
      borderRadii: field_cornerRadii.optional(),
      background: field_background,
      padding: field_padding,
    }),
    content: z.strictObject({
      textStyle: field_textStyle,
      accentColor: z
        .string()
        .refine(
          (value) => new RegExp('^#[0-9A-Fa-f]{8}$').test(value),
          'STRING_FORMAT',
        ),
    }),
    bindings: z
      .array(
        z.strictObject({
          target: z.literal('entries'),
          source: z.enum(['timeline']),
          fallback: field_timeline.optional(),
        }),
      )
      .max(1),
  }),
});

export const rawDesignSchema: z.ZodType = z.strictObject({
  schemaVersion: z.literal(1),
  nodes: z
    .strictObject({ ROOT: field_root })
    .catchall(
      z.union([
        field_Text,
        field_Image,
        field_Decoration,
        field_Shape,
        field_Calendar,
        field_Countdown,
        field_Map,
        field_RSVP,
        field_QRBank,
        field_Timeline,
      ]),
    )
    .refine(
      (value) =>
        Object.keys(value).every(
          (key) =>
            ['ROOT'].includes(key) ||
            new RegExp(
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            ).test(key),
        ),
      'NODE_ID',
    )
    .refine((value) => Object.keys(value).length <= 201, 'NODE_LIMIT'),
});

export const rawWeddingSchema: z.ZodType = z.strictObject({
  schemaVersion: z.literal(1),
  bride: z
    .strictObject({
      name: text(120, 0).optional(),
      photo: z
        .string()
        .refine(
          (value) =>
            new RegExp(
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            ).test(value),
          'STRING_FORMAT',
        )
        .optional(),
    })
    .optional(),
  groom: z
    .strictObject({
      name: text(120, 0).optional(),
      photo: z
        .string()
        .refine(
          (value) =>
            new RegExp(
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            ).test(value),
          'STRING_FORMAT',
        )
        .optional(),
    })
    .optional(),
  couple: z
    .strictObject({
      photo: z
        .string()
        .refine(
          (value) =>
            new RegExp(
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            ).test(value),
          'STRING_FORMAT',
        )
        .optional(),
    })
    .optional(),
  parents: z
    .strictObject({
      bride: z
        .strictObject({
          fatherName: text(120, 0).optional(),
          motherName: text(120, 0).optional(),
        })
        .optional(),
      groom: z
        .strictObject({
          fatherName: text(120, 0).optional(),
          motherName: text(120, 0).optional(),
        })
        .optional(),
    })
    .optional(),
  story: text(5000, 0).optional(),
  events: z
    .strictObject({
      ceremony: field_event.optional(),
      reception: field_event.optional(),
      engagement: field_event.optional(),
      afterParty: field_event.optional(),
    })
    .optional(),
  timeline: field_timeline.optional(),
  bank: field_bank.optional(),
});
