'use client';
import type { NodeOptions } from '../document/editor-document';
import {
  NumberControl,
  PropertySection,
  RangeNumber,
  SwitchRow,
} from './property-controls';
import styles from './property-controls.module.css';

const entrances = [
  ['none', 'Không có'],
  ['fade', 'Fade In'],
  ['slide', 'Slide Up'],
  ['slide-down', 'Slide Down'],
  ['slide-left', 'Slide Left'],
  ['slide-right', 'Slide Right'],
  ['scale', 'Scale In'],
  ['scale-out', 'Scale Out'],
  ['rotate', 'Rotate In'],
  ['bounce', 'Bounce In'],
] as const;
export function MotionControls({
  options,
  onChange,
}: {
  options: NodeOptions;
  onChange: (value: NodeOptions) => void;
}) {
  const enabled =
    options.entranceEnabled ??
    (!!options.entrance && options.entrance !== 'none');
  return (
    <>
      <PropertySection title="Hiệu ứng chuyển động">
        <SwitchRow
          label="Bật hiệu ứng"
          checked={enabled}
          onChange={(next) =>
            onChange({
              entranceEnabled: next,
              ...(next && (!options.entrance || options.entrance === 'none')
                ? {
                    entrance: 'fade',
                    entranceDuration: options.entranceDuration ?? 1.6,
                    entranceDelay: options.entranceDelay ?? 0,
                    entranceEasing: options.entranceEasing ?? 'ease-out',
                  }
                : {}),
            })
          }
        />
        {enabled && (
          <>
            <label className={styles.stackField}>
              Loại hiệu ứng
              <select
                aria-label="Loại hiệu ứng"
                value={options.entrance ?? 'fade'}
                onChange={(event) =>
                  onChange({
                    entrance: event.target.value as NodeOptions['entrance'],
                  })
                }
              >
                {entrances.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                {options.entrance === 'flip' && (
                  <option value="flip">Flip In</option>
                )}
              </select>
            </label>
            <RangeNumber
              label="Thời gian hiệu ứng"
              unit="s"
              value={options.entranceDuration ?? 1.6}
              min={0.1}
              max={5}
              step={0.1}
              onChange={(entranceDuration) => onChange({ entranceDuration })}
            />
            <RangeNumber
              label="Độ trễ hiệu ứng"
              unit="s"
              value={options.entranceDelay ?? 0}
              min={0}
              max={3}
              step={0.1}
              onChange={(entranceDelay) => onChange({ entranceDelay })}
            />
            <label className={styles.stackField}>
              Kiểu chuyển động
              <select
                aria-label="Kiểu chuyển động"
                value={options.entranceEasing ?? 'ease-out'}
                onChange={(event) =>
                  onChange({
                    entranceEasing: event.target
                      .value as NodeOptions['entranceEasing'],
                  })
                }
              >
                <option value="linear">Linear</option>
                <option value="ease">Ease</option>
                <option value="ease-in">Ease In</option>
                <option value="ease-out">Ease Out</option>
                <option value="ease-in-out">Ease In Out</option>
              </select>
            </label>
          </>
        )}
      </PropertySection>
      <PropertySection title="Chuyển động liên tục">
        <label className={styles.stackField}>
          Loại chuyển động
          <select
            aria-label="Loại chuyển động"
            value={options.continuous ?? 'none'}
            onChange={(event) =>
              onChange({
                continuous: event.target.value as NodeOptions['continuous'],
                continuousDuration: options.continuousDuration ?? 2,
                continuousDelay: options.continuousDelay ?? 0,
              })
            }
          >
            <option value="none">Không có</option>
            <option value="float">Bay lơ lửng</option>
            <option value="bounce">Nảy</option>
            <option value="blink">Nhấp nháy</option>
            <option value="spin">Xoay tròn</option>
            <option value="shake">Lắc</option>
            <option value="swing">Lắc lư</option>
            <option value="wiggle">Lắc lư nhún nhảy</option>
            {options.continuous === 'pulse' && (
              <option value="pulse">Nhịp nhẹ</option>
            )}
          </select>
        </label>
        {options.continuous && options.continuous !== 'none' && (
          <>
            <div className={styles.row}>
              <span>Thời gian (giây)</span>
              <NumberControl
                label="Thời gian chuyển động liên tục"
                value={options.continuousDuration ?? 2}
                min={0.5}
                max={10}
                step={0.5}
                onChange={(continuousDuration) =>
                  onChange({ continuousDuration })
                }
              />
            </div>
            <div className={styles.row}>
              <span>Độ trễ (giây)</span>
              <NumberControl
                label="Độ trễ chuyển động liên tục"
                value={options.continuousDelay ?? 0}
                min={0}
                max={5}
                step={0.5}
                onChange={(continuousDelay) => onChange({ continuousDelay })}
              />
            </div>
          </>
        )}
      </PropertySection>
    </>
  );
}
