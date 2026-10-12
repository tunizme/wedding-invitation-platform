import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react';
import styles from './controls.module.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  helper?: string;
  error?: string;
};

export const Field = forwardRef<HTMLInputElement, Props>(function Field(
  {
    id,
    label,
    helper,
    error,
    className,
    'aria-describedby': describedBy,
    ...rest
  },
  ref,
) {
  const description = [
    describedBy,
    helper && `${id}-help`,
    error && `${id}-error`,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        {...rest}
        ref={ref}
        id={id}
        aria-invalid={error ? true : rest['aria-invalid']}
        aria-describedby={description || undefined}
        className={[styles.input, className].filter(Boolean).join(' ')}
      />
      {helper && (
        <span className={styles.helper} id={`${id}-help`}>
          {helper}
        </span>
      )}
      {error && (
        <span className={styles.error} id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
});

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  id: string;
  label: string;
  helper?: string;
  error?: string;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(
  function SelectField(
    {
      id,
      label,
      helper,
      error,
      className,
      children,
      'aria-describedby': describedBy,
      ...rest
    },
    ref,
  ) {
    const description = [
      describedBy,
      helper && `${id}-help`,
      error && `${id}-error`,
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={styles.field}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        <select
          {...rest}
          ref={ref}
          id={id}
          aria-invalid={error ? true : rest['aria-invalid']}
          aria-describedby={description || undefined}
          className={[styles.input, className].filter(Boolean).join(' ')}
        >
          {children}
        </select>
        {helper && (
          <span className={styles.helper} id={`${id}-help`}>
            {helper}
          </span>
        )}
        {error && (
          <span className={styles.error} id={`${id}-error`}>
            {error}
          </span>
        )}
      </div>
    );
  },
);
