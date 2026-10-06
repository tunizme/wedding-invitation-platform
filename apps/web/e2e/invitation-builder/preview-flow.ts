import { randomUUID } from 'node:crypto';
import type { Page, Request } from '@playwright/test';
import jsQR from 'jsqr';
import { expect } from './fixtures';

export async function verifyPreviewFlow(page: Page, builderOrigin: string) {
  const rsvpPosts: string[] = [];
  const onRequest = (request: Request) => {
    if (request.method() === 'POST' && /rsvp/i.test(request.url())) rsvpPosts.push(request.url());
  };
  page.on('request', onRequest);
  try {
    await page.goto(builderOrigin + '/admin/templates/new');
    await page.getByLabel('Tên mẫu', { exact: true }).fill('Preview ' + randomUUID());
    await page.getByLabel('Danh mục', { exact: true }).fill('Wedding');
    await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await page.getByRole('button', { name: 'Thêm văn bản', exact: true }).click();
    await page.getByLabel('Nội dung', { exact: true }).fill('Tên cô dâu');
    await page.getByLabel('Nội dung', { exact: true }).blur();
    await page.getByLabel('Liên kết văn bản', { exact: true }).selectOption('bride.name');
    await page.getByRole('button', { name: 'Thêm QRBank', exact: true }).click();
    await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Đã lưu');
    await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
    const pixels = await page.getByRole('img', { name: 'Mừng cưới QR' }).evaluate(async (element) => {
      const svg = new XMLSerializer().serializeToString(element);
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const image = new Image(); image.width = 500; image.height = 500; image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 500; canvas.height = 500;
        const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
        context.fillStyle = '#fff'; context.fillRect(0, 0, 500, 500); context.drawImage(image, 0, 0, 500, 500);
        const { data, width, height } = context.getImageData(0, 0, 500, 500);
        return { data: Array.from(data), width, height };
      } finally { URL.revokeObjectURL(url); }
    });
    expect(jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)?.data).toMatch(/^000201010211/);
    await page.getByRole('button', { name: 'Quay lại chỉnh sửa', exact: true }).click();
    await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
    await expect(page.getByLabel('Chiều rộng xem trước', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mẫu dữ liệu B', exact: true }).click();
    await expect(page.getByTestId('workarea')).toContainText('Trần Ngọc Hà');
    await page.getByLabel('Chiều rộng xem trước', { exact: true }).selectOption('360');
    await page.getByRole('button', { name: 'Mẫu dữ liệu A', exact: true }).click();
    await expect(page.getByTestId('workarea')).toContainText('Nguyễn Minh Anh');
    await expect(page.getByRole('status')).toContainText('Đã lưu');
    expect(rsvpPosts).toEqual([]);
  } finally {
    page.off('request', onRequest);
  }
}
