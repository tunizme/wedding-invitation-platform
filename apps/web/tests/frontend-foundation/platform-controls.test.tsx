import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../src/ui/platform/button';
import { Field, SelectField } from '../../src/ui/platform/field';
import {
  InlineAlert,
  LocalStatus,
  StatusBadge,
} from '../../src/ui/platform/feedback';

describe('approved platform controls', () => {
  it('forwards a native button ref and disables interaction while busy', () => {
    const ref = createRef<HTMLButtonElement>();
    const click = vi.fn();
    render(
      <Button ref={ref} onClick={click} busy>
        Đăng nhập
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Đăng nhập' });
    expect(ref.current).toBe(button);
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(click).not.toHaveBeenCalled();
  });

  it('associates a visible label, helper and error with a native field', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Field
        ref={ref}
        id="account-email"
        label="Email"
        type="email"
        helper="Dùng email đã xác minh"
        error="Email không hợp lệ"
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(ref.current).toBe(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const description = input.getAttribute('aria-describedby') ?? '';
    expect(description).toContain('account-email-help');
    expect(description).toContain('account-email-error');
    expect(screen.getByText('Email không hợp lệ').getAttribute('id')).toBe(
      'account-email-error',
    );
  });

  it('exposes persistent critical feedback and readable status text', () => {
    render(
      <>
        <InlineAlert tone="error">Không thể lưu</InlineAlert>
        <LocalStatus tone="success">Đã lưu</LocalStatus>
        <StatusBadge tone="warning">Cần kiểm tra</StatusBadge>
      </>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Không thể lưu');
    expect(screen.getByRole('status').textContent).toContain('Đã lưu');
    expect(screen.getByText('Cần kiểm tra')).toBeTruthy();
  });

  it('keeps control variants distinct and forwards a native select ref', () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <>
        <Button variant="secondary">Hủy</Button>
        <Button variant="destructive">Khóa</Button>
        <SelectField
          ref={ref}
          id="customer-state"
          label="Trạng thái"
          defaultValue="ACTIVE"
        >
          <option value="ACTIVE">ACTIVE</option>
        </SelectField>
      </>,
    );
    const secondary = screen.getByRole('button', { name: 'Hủy' });
    const destructive = screen.getByRole('button', { name: 'Khóa' });
    expect(secondary.className).not.toBe(destructive.className);
    expect(ref.current).toBe(
      screen.getByRole('combobox', { name: 'Trạng thái' }),
    );
    expect(screen.getByRole('combobox')).toHaveValue('ACTIVE');
  });
});
