import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarWidget } from '../../src/features/invitation-builder/renderer/widgets/calendar';
import { CountdownWidget } from '../../src/features/invitation-builder/renderer/widgets/countdown';
import { MapWidget } from '../../src/features/invitation-builder/renderer/widgets/map';
import { RsvpWidget } from '../../src/features/invitation-builder/renderer/widgets/rsvp';
import { TimelineWidget } from '../../src/features/invitation-builder/renderer/widgets/timeline';
import {
  SampleDataPanel,
  sampleWeddingData,
} from '../../src/features/invitation-builder/editor/sample-data-panel';

describe('wedding widget display states', () => {
  it('uses the real field-error markup for capture and keeps all controls inert', () => {
    const submit = vi.fn();
    render(
      <RsvpWidget
        title="RSVP"
        mode="capture"
        displayState="validation-error"
        onSubmit={submit}
      />,
    );
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    for (const label of ['Tên khách mời', 'Số người (gồm bạn)', 'Lời nhắn']) {
      expect(screen.getByLabelText(label)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(screen.getByLabelText(label)).toBeDisabled();
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-describedby');
    }
    fireEvent.submit(screen.getByRole('form', { name: 'RSVP' }));
    expect(submit).not.toHaveBeenCalled();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  it('ticks in public mode, resumes with the current clock and ends without negative values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-10T03:00:00Z'));
    const { unmount } = render(
      <CountdownWidget
        datetime="2027-01-10T03:00:03Z"
        timeZone="Asia/Ho_Chi_Minh"
        asOf="2027-01-10T03:00:00Z"
        label="Còn lại"
        endedLabel="Kết thúc"
        live
      />,
    );
    expect(screen.getByLabelText('Giây')).toHaveTextContent('03');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText('Giây')).toHaveTextContent('02');
    act(() => {
      vi.setSystemTime(new Date('2027-01-10T03:00:04Z'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(screen.getByText('Kết thúc')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });
  it('renders a Monday-first Gregorian calendar and marks the event date', () => {
    const { container } = render(
      <CalendarWidget
        datetime="2027-01-10T10:00:00+07:00"
        timeZone="Asia/Ho_Chi_Minh"
        accentColor="#AABBCCFF"
      />,
    );
    expect(screen.getByRole('grid')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('tháng 1'),
    );
    expect(container.querySelector('[aria-current="date"]')).toHaveTextContent(
      '10',
    );
    expect(screen.getByText('T2')).toBeInTheDocument();
  });

  it('freezes countdown at supplied clock and caps days to four digits', () => {
    const { rerender } = render(
      <CountdownWidget
        datetime="2027-01-10T10:00:00+07:00"
        timeZone="Asia/Ho_Chi_Minh"
        asOf="2027-01-10T03:00:00Z"
        label="Còn lại"
        endedLabel="Đã đến ngày vui"
      />,
    );
    expect(screen.getByText('Đã đến ngày vui')).toBeInTheDocument();
    rerender(
      <CountdownWidget
        datetime="2070-01-01T00:00:00+07:00"
        timeZone="Asia/Ho_Chi_Minh"
        asOf="2026-01-01T00:00:00Z"
        label="Còn lại"
        endedLabel="Kết thúc"
      />,
    );
    expect(screen.getByLabelText('Ngày')).toHaveTextContent('9999');
  });

  it('always shows address and directions, while capture uses a local map placeholder', () => {
    const venue = {
      name: 'Nhà hàng Mẫu',
      address: '1 Đường Hoa',
      latitude: 10.7769,
      longitude: 106.7009,
    };
    const { rerender, container } = render(
      <MapWidget venue={venue} mode="public" />,
    );
    expect(screen.getByText('1 Đường Hoa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /chỉ đường/i })).toHaveAttribute(
      'href',
      expect.stringContaining('destination=10.7769%2C106.7009'),
    );
    rerender(<MapWidget venue={venue} mode="capture" />);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('preserves saved timeline order', () => {
    render(
      <TimelineWidget
        entries={[
          { id: 'a', title: 'Lễ gia tiên', dateLabel: 'Sáng' },
          { id: 'b', title: 'Tiệc cưới', dateLabel: 'Tối' },
        ]}
      />,
    );
    const titles = within(
      screen.getByRole('list', { name: 'Dòng thời gian' }),
    ).getAllByRole('heading');
    expect(titles.map((title) => title.textContent)).toEqual([
      'Lễ gia tiên',
      'Tiệc cưới',
    ]);
  });

  it('keeps preview RSVP inert and never calls a submit transport', async () => {
    const submit = vi.fn();
    render(
      <RsvpWidget
        title="Xác nhận tham dự"
        displayState="open"
        mode="preview"
        onSubmit={submit}
      />,
    );
    expect(screen.getByRole('button', { name: /xác nhận/i })).toBeDisabled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it('edits sample WeddingData outside the TemplateDesign and switches explicit samples', () => {
    const onSelect = vi.fn(),
      onChange = vi.fn(),
      sample = sampleWeddingData('A');
    render(
      <SampleDataPanel
        selected="A"
        data={sample}
        onSelect={onSelect}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Tên cô dâu mẫu'), {
      target: { value: 'Nguyễn An' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ bride: { name: 'Nguyễn An' } }),
    );
    screen.getByRole('button', { name: 'Mẫu dữ liệu B' }).click();
    expect(onSelect).toHaveBeenCalledWith('B');
  });
  it('keeps a selected sample photo that is outside the loaded asset page', () => {
    const photo = '00000000-0000-4000-8000-000000000999';
    render(
      <SampleDataPanel
        selected="A"
        data={{ schemaVersion: 1, bride: { photo } }}
        assets={[]}
        onSelect={vi.fn()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Ảnh mẫu cô dâu')).toHaveValue(photo);
    expect(
      screen.getByRole('option', { name: 'Ảnh đang sử dụng' }),
    ).toHaveValue(photo);
  });
  it('renders map label, fits iframe and preserves inherited calendar color', () => {
    const { container } = render(
      <div style={{ color: '#123456' }}>
        <CalendarWidget
          datetime="2027-01-10T10:00:00+07:00"
          timeZone="Asia/Ho_Chi_Minh"
          accentColor="#AABBCCFF"
        />
        <MapWidget
          venue={{
            name: 'Venue',
            address: 'Address',
            latitude: 10,
            longitude: 106,
          }}
          mode="public"
          label="Nhãn tùy chỉnh"
        />
      </div>,
    );
    expect(screen.getByText('Nhãn tùy chỉnh')).toBeInTheDocument();
    expect(container.querySelector('iframe')).toHaveStyle({
      width: '100%',
      height: '100%',
    });
    expect(screen.getByLabelText('Lịch sự kiện')).toHaveStyle({
      color: 'rgb(18, 52, 86)',
    });
  });
  it('keeps capture RSVP inert while showing error and submitting variants', () => {
    const submit = vi.fn();
    const { rerender } = render(
      <RsvpWidget
        title="RSVP"
        mode="capture"
        displayState="error"
        onSubmit={submit}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Chưa xác định');
    expect(
      screen.getByRole('textbox', { name: 'Tên khách mời' }),
    ).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'RSVP' }));
    expect(submit).not.toHaveBeenCalled();
    rerender(
      <RsvpWidget title="RSVP" mode="capture" displayState="submitting" />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent('Đang gửi');
  });
});
