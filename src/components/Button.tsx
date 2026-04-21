import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'active';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, fullWidth = false, type = 'button', variant = 'secondary', ...props },
  ref
) {
  return (
    <button
      {...props}
      className={clsx(styles.button, styles[variant], fullWidth && styles.fullWidth, className)}
      ref={ref}
      type={type}
    >
      {children}
    </button>
  );
});
