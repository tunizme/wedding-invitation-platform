import { forwardRef, type ButtonHTMLAttributes } from 'react';
import styles from './controls.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  busy?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'primary',
    busy = false,
    disabled,
    className,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      {...rest}
      // Firefox can restore dynamic disabled state across reloads. Button
      // state belongs to React; this Firefox attribute leaves field autofill intact.
      {...{ autoComplete: 'off' }}
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={[styles.button, styles[variant], className]
        .filter(Boolean)
        .join(' ')}
    />
  );
});
