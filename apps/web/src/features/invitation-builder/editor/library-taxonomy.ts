// Library categories (FR-016). Slugs are stored on assets.category; labels are display-only.
export interface LibraryCategory {
  slug: string;
  label: string;
}
export const STOCK_CATEGORIES: LibraryCategory[] = [
  { slug: 'yeu-to-dam-cuoi', label: 'Yếu tố đám cưới' },
  { slug: 'van-hoa-viet', label: 'Văn hóa Việt' },
  { slug: 'nhan-vat', label: 'Nhân vật' },
  { slug: 'hoa-cuoi', label: 'Hoa cưới' },
  { slug: 'chu-hy', label: 'Chữ hỷ' },
  { slug: 'trai-tim', label: 'Trái tim' },
  { slug: 'ket-hop-chu', label: 'Kết hợp chữ' },
  { slug: 'so-va-chu-cai', label: 'Số và chữ cái' },
  { slug: 'trang-tri-khong-gian', label: 'Trang trí không gian' },
  { slug: 'chuc-mung-sinh-nhat', label: 'Chúc mừng sinh nhật' },
  { slug: 'mat-troi', label: 'Mặt trời' },
  { slug: 'le-hoi-noi-bat', label: 'Lễ hội nổi bật' },
  { slug: 'ngoi-sao', label: 'Ngôi sao' },
  { slug: 'me-va-be', label: 'Mẹ và bé' },
  { slug: 'bieu-tuong-luu-do', label: 'Biểu tượng lưu đồ' },
  { slug: 'ban-do', label: 'Bản đồ' },
  { slug: 'hinh-dang', label: 'Hình dạng' },
  { slug: 'khung-vien', label: 'Khung viền' },
  { slug: 'duong-phan-cach', label: 'Đường phân cách' },
];
export const BACKGROUND_CATEGORIES: LibraryCategory[] = [
  { slug: 'nen-hoa-van', label: 'Nền hoa văn' },
];
export const AUDIO_CATEGORIES: LibraryCategory[] = [
  { slug: 'nhac-ngoai', label: 'Nhạc ngoại' },
  { slug: 'v-pop', label: 'V-POP' },
];
export const PRESET_CATEGORIES = [
  'Ảnh',
  'Thông tin',
  'Lịch trình',
  'Lời mời',
  'Khác',
];
export function categoriesFor(
  kind: 'IMAGE' | 'DECORATION' | 'BACKGROUND' | 'AUDIO' | 'PRESET' | 'TEMPLATE',
): LibraryCategory[] {
  if (kind === 'DECORATION') return STOCK_CATEGORIES;
  if (kind === 'BACKGROUND') return BACKGROUND_CATEGORIES;
  if (kind === 'AUDIO') return AUDIO_CATEGORIES;
  if (kind === 'PRESET')
    return PRESET_CATEGORIES.map((label) => ({ slug: label, label }));
  return [];
}
