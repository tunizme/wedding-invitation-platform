import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import FoundationPage from '../src/app/page';

describe('foundation page', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3001/api/v1';
  });

  it('renders without contacting the backend', () => {
    render(<FoundationPage />);
    expect(
      screen.getByRole('heading', { name: 'Wedding Invitation Platform' }),
    ).toBeVisible();
    expect(screen.getByText(/ready for MVP feature development/)).toBeVisible();
  });
});
