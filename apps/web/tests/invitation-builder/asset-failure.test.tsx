import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  AssetImage,
  BackgroundAssetStatus,
} from '../../src/features/invitation-builder/renderer/asset-image';
afterEach(cleanup);
it('replaces a broken image with a readable fallback while retaining other content', () => {
  const { container } = render(
    <>
      <AssetImage source="/broken.webp" />
      <p>Thiệp vẫn xem được</p>
    </>,
  );
  fireEvent.error(container.querySelector('img')!);
  expect(
    screen.getByRole('img', { name: 'Không thể tải ảnh' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Thiệp vẫn xem được')).toBeInTheDocument();
  expect(container.querySelector('[data-asset-error]')).not.toBeNull();
});
it('allows recovery when a replacement background loads', () => {
  const { rerender, container } = render(
    <BackgroundAssetStatus source="/broken.webp" />,
  );
  fireEvent.error(container.querySelector('img')!);
  expect(
    screen.getByRole('img', { name: 'Không thể tải nền' }),
  ).toBeInTheDocument();
  rerender(<BackgroundAssetStatus source="/new.webp" />);
  expect(container.querySelector('img')).toHaveAttribute('src', '/new.webp');
  expect(container.querySelector('[data-asset-error]')).toBeNull();
});
