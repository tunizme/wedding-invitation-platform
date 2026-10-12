import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FoundationPage from '../src/app/(product)/page';

describe('005 US5 product home', () => {
  it('presents the approved introduction without backend configuration or mock catalog', () => {
    render(<FoundationPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Lời mời nhỏ. Ngày thật lớn.',
    );
    expect(
      screen.getByRole('link', { name: /Khám phá mẫu cưới/ }),
    ).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/REST API base/)).not.toBeInTheDocument();
    expect(screen.getByText(/Hình ảnh minh họa/)).toBeVisible();
  });
});
