import type {
  Appearance,
  Binding,
  ComponentName,
  ContentByKind,
  ElementNode,
  TemplateDesign,
  SupportedTemplateDesign,
  TextStyle,
  WeddingData,
} from '../../web/src/features/invitation-builder/document/types';
import { createPrototypeDesign } from './responsive-fixtures';
import photoOne from './assets/couple-one.jpg';
import photoTwo from './assets/couple-two.jpg';
import photoThree from './assets/couple-three.jpg';

export const AS_OF = '2026-10-10T08:00:00Z';
export const ASSET_IDS = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
];
export const assetUrls: Record<string, string> = Object.fromEntries(
  ASSET_IDS.map((id, i) => [id, [photoOne, photoTwo, photoThree][i]]),
);
export const sampleData: WeddingData = {
  schemaVersion: 1,
  bride: { name: 'Ngọc Anh', photo: ASSET_IDS[1] },
  groom: { name: 'Minh Quân', photo: ASSET_IDS[2] },
  couple: { photo: ASSET_IDS[0] },
  parents: {
    bride: { fatherName: 'Nguyễn Văn An', motherName: 'Trần Thị Mai' },
    groom: { fatherName: 'Lê Văn Minh', motherName: 'Phạm Thị Hoa' },
  },
  story:
    'Từ một cuộc gặp tình cờ, chúng mình tìm thấy người muốn cùng đi qua những ngày bình thường nhất. Và hôm nay, một chương mới bắt đầu.',
  events: {
    reception: {
      datetime: '2026-12-20T17:00:00+07:00',
      timeZone: 'Asia/Ho_Chi_Minh',
      venue: {
        name: 'The Secret Garden',
        address: '12 Nguyễn Thị Minh Khai, TP. Hồ Chí Minh',
        latitude: 10.784,
        longitude: 106.699,
      },
    },
  },
  timeline: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      title: 'Ngày đầu gặp nhau',
      description: 'Một tách cà phê, và một câu chuyện chưa có hồi kết.',
      dateLabel: 'Tháng 5 · 2022',
    },
    {
      id: '20000000-0000-4000-8000-000000000002',
      title: 'Mình về chung nhà',
      description: 'Cùng nhau viết tiếp những ngày thật đẹp.',
      dateLabel: 'Tháng 12 · 2026',
    },
  ],
  bank: {
    bin: '970436',
    account: '0000000000',
    recipientName: 'TAI KHOAN MINH HOA',
    message: 'PROTOTYPE KHONG CHUYEN',
  },
};
export type TemplateFixture = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  caption: string;
  paper: string;
  ink: string;
  accent: string;
  photo: string;
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
};
export const templates: TemplateFixture[] = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Một ngày chung đôi',
    category: 'Hiện đại',
    tags: ['Tối giản', 'Editorial'],
    caption: 'Một lời mời nhẹ nhàng, một ngày đáng nhớ.',
    paper: '#f6f2e8',
    ink: '#343b2f',
    accent: '#88917b',
    photo: ASSET_IDS[0],
    status: 'PUBLISHED',
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    name: 'Lời thương màu đỏ',
    category: 'Truyền thống',
    tags: ['Á Đông', 'Trang trọng'],
    caption: 'Sắc đỏ thân quen trong một câu chuyện mới.',
    paper: '#f8eee5',
    ink: '#802f36',
    accent: '#aa6265',
    photo: ASSET_IDS[1],
    status: 'PUBLISHED',
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    name: 'Dưới tán xanh',
    category: 'Thiên nhiên',
    tags: ['Botanical', 'Tối giản'],
    caption: 'Dịu dàng như những ngày bên nhau.',
    paper: '#edf0e9',
    ink: '#354e40',
    accent: '#6d826b',
    photo: ASSET_IDS[2],
    status: 'PUBLISHED',
  },
  {
    id: '30000000-0000-4000-8000-000000000004',
    name: 'Chuyện của chúng mình',
    category: 'Hiện đại',
    tags: ['Editorial', 'Đen trắng'],
    caption: 'Một chương mới, viết bằng những điều giản dị.',
    paper: '#eeeae5',
    ink: '#282828',
    accent: '#77716b',
    photo: ASSET_IDS[1],
    status: 'PUBLISHED',
  },
];

export function createDesign(template: TemplateFixture): TemplateDesign {
  const nodes: TemplateDesign['nodes'] = {
    ROOT: {
      type: { resolvedName: 'InvitationCanvas' },
      isCanvas: true,
      props: {
        canvas: {
          width: 390,
          height: 2400,
          background: { kind: 'solid', color: `${template.paper}ff` },
        },
      },
      displayName: 'InvitationCanvas',
      custom: {},
      hidden: false,
      nodes: [],
      linkedNodes: {},
    },
  };
  const appearance: Appearance = {
    opacity: 1,
    borderRadius: 0,
    border: { width: 0, color: `${template.ink}ff`, style: 'solid' },
    shadow: null,
  };
  const textStyle = (size = 18, serif = false): TextStyle => ({
    fontId: serif ? 'noto-serif-v1' : 'noto-sans-v1',
    fontSize: size,
    fontWeight: 400,
    italic: false,
    underline: false,
    color: `${template.ink}ff`,
    letterSpacing: 0,
    lineHeight: 1.6,
    textAlign: 'center',
    textTransform: 'none',
  });
  function node<K extends ComponentName>(
    type: K,
    y: number,
    height: number,
    content: ContentByKind[K],
    bindings: Binding[] = [],
    optional = false,
  ) {
    const id = `40000000-0000-4000-8000-${String(nodes.ROOT.nodes.length + 1).padStart(12, '0')}`;
    nodes[id] = {
      type: { resolvedName: type },
      isCanvas: false,
      props: {
        box: { x: 28, y, width: 334, height, rotation: 0 },
        appearance: {
          ...appearance,
          ...(type === 'Image' || type === 'Decoration'
            ? {}
            : {
                background: { kind: 'solid', color: '#00000000' },
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
              }),
        },
        content,
        bindings,
      },
      displayName: type,
      custom: { layerName: type, locked: false, optional },
      hidden: false,
      parent: 'ROOT',
      nodes: [],
      linkedNodes: {},
    } as ElementNode;
    nodes.ROOT.nodes.push(id);
  }
  const text = (
    value: string,
    y: number,
    h: number,
    size: number,
    bindings: Binding[] = [],
    optional = false,
  ) =>
    node(
      'Text',
      y,
      h,
      { text: value, textStyle: textStyle(size, size >= 26) },
      bindings,
      optional,
    );
  text('CHÚNG MÌNH SẮP CƯỚI', 32, 34, 14);
  text('Ngọc Anh', 82, 68, 36, [{ target: 'text', source: 'bride.name' }]);
  text('&', 150, 38, 24);
  text('Minh Quân', 192, 68, 36, [{ target: 'text', source: 'groom.name' }]);
  node(
    'Image',
    292,
    320,
    { assetId: template.photo, fit: 'cover', positionX: 0.5, positionY: 0.5 },
    [{ target: 'assetId', source: 'couple.photo' }],
  );
  text('TRÂN TRỌNG KÍNH MỜI', 652, 36, 14);
  text('Cùng chúng mình\nlưu giữ ngày thật đẹp.', 696, 108, 28);
  text('', 828, 44, 20, [
    { target: 'text', source: 'wedding.date', eventKey: 'reception' },
  ]);
  text('', 880, 40, 18, [
    { target: 'text', source: 'wedding.time', eventKey: 'reception' },
  ]);
  text('', 952, 52, 26, [
    { target: 'text', source: 'venue.name', eventKey: 'reception' },
  ]);
  text('', 1012, 80, 18, [
    { target: 'text', source: 'venue.address', eventKey: 'reception' },
  ]);
  text('Câu chuyện của chúng mình', 1132, 84, 26);
  text('', 1232, 204, 18, [{ target: 'text', source: 'story' }], true);
  node(
    'Timeline',
    1460,
    240,
    { textStyle: textStyle(), accentColor: `${template.ink}ff` },
    [{ target: 'entries', source: 'timeline' }],
    true,
  );
  node('RSVP', 1736, 570, {
    textStyle: textStyle(),
    title: 'Bạn sẽ đến cùng chúng mình chứ?',
    closedLabel: 'Hai bạn đã đóng nhận phản hồi.',
    successLabel: 'Cảm ơn bạn. Hẹn gặp trong ngày chung đôi!',
  });
  text('Cảm ơn vì đã là một phần câu chuyện.', 2328, 52, 16);
  if (template.id === templates[0].id) {
    nodes.ROOT.props.canvas.height = 3760;
    text('GIA ĐÌNH HAI BÊN', 2440, 40, 14);
    (
      [
        'parents.bride.fatherName',
        'parents.bride.motherName',
        'parents.groom.fatherName',
        'parents.groom.motherName',
      ] as const
    ).forEach((source, i) =>
      text('', 2500 + i * 50, 44, 18, [{ target: 'text', source }], true),
    );
    node(
      'Image',
      2730,
      290,
      { assetId: ASSET_IDS[1], fit: 'cover', positionX: 0.5, positionY: 0.5 },
      [{ target: 'assetId', source: 'bride.photo' }],
      true,
    );
    const bride = nodes[nodes.ROOT.nodes.at(-1)!] as ElementNode;
    bride.props.box.width = 155;
    node(
      'Image',
      2730,
      290,
      { assetId: ASSET_IDS[2], fit: 'cover', positionX: 0.5, positionY: 0.5 },
      [{ target: 'assetId', source: 'groom.photo' }],
      true,
    );
    const groom = nodes[nodes.ROOT.nodes.at(-1)!] as ElementNode;
    groom.props.box.width = 155;
    groom.props.box.x = 207;
    text('MỪNG CƯỚI · THÔNG TIN MINH HỌA', 3090, 48, 14);
    node(
      'QRBank',
      3170,
      520,
      {
        textStyle: textStyle(),
        label: 'Không chuyển tiền · tài khoản minh họa',
      },
      [{ target: 'bank', source: 'bank' }],
      true,
    );
  }
  return { schemaVersion: 1, nodes };
}

export type InvitationFixture = {
  id: string;
  templateId: string;
  document: SupportedTemplateDesign;
  data: WeddingData;
  publishedData: WeddingData | null;
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
  updatedAt: string;
  rsvpOpen: boolean;
};
export function initialInvitations(): InvitationFixture[] {
  return [
    {
      id: '50000000-0000-4000-8000-000000000001',
      templateId: templates[0].id,
      document: createPrototypeDesign(templates[0]),
      data: structuredClone(sampleData),
      publishedData: structuredClone(sampleData),
      status: 'PUBLISHED',
      updatedAt: AS_OF,
      rsvpOpen: true,
    },
    {
      id: '50000000-0000-4000-8000-000000000002',
      templateId: templates[1].id,
      document: createPrototypeDesign(templates[1]),
      data: {
        ...structuredClone(sampleData),
        bride: { name: 'Thanh Mai' },
        groom: { name: 'Đức Anh' },
      },
      publishedData: null,
      status: 'DRAFT',
      updatedAt: AS_OF,
      rsvpOpen: true,
    },
  ];
}
