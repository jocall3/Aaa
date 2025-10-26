import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

/**
 * @ TSDoc
 * A utility component for rendering a loading spinner.
 * It's used internally by the Button component in its loading state.
 */
const Spinner: React.FC<{ size: 'sm' | 'md' | 'lg' }> = ({ size }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <svg
      className={`animate-spin ${sizeClasses[size]} text-current`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
};

/**
 * @ TSDoc
 * Defines the visual variants of the button component. This utility is used to generate
 * the appropriate CSS classes based on the button's props. It ensures a consistent
 * and maintainable styling approach across the design system.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 rounded-md px-3',
        md: 'h-10 px-4 py-2',
        lg: 'h-11 rounded-md px-8',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

/**
 * @ TSDoc
 * Defines the properties for the Button component.
 * It extends standard HTML button attributes to allow passthrough of native props
 * and includes variants for styling and behavior customization.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * @ TSDoc
   * If `true`, the button will be in a loading state, showing a spinner
   * and disabling user interaction.
   * @default false
   */
  isLoading?: boolean;
  /**
   * @ TSDoc
   * An optional React element to be displayed to the left of the button's content.
   * Typically used for icons.
   */
  leftIcon?: React.ReactElement;
  /**
   * @ TSDoc
   * An optional React element to be displayed to the right of the button's content.
   * Typically used for icons.
   */
  rightIcon?: React.ReactElement;
}

/**
 * @ TSDoc
 * A foundational, interactive button component for the design system.
 *
 * This component serves as a base for all button elements across the application,
 * ensuring consistent styling, behavior, and accessibility. It supports various
 * visual styles, sizes, and states like loading and disabled.
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="lg" onClick={() => alert('Clicked!')}>
 *   Primary Action
 * </Button>
 *
 * <Button variant="secondary" isLoading={true} leftIcon={<LockIcon />}>
 *   Processing
 * </Button>
 * ```
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      children,
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      ...props
    },
    ref
  ) => {
    const effectiveSize = size || 'md'; // Ensure size is not null for the spinner

    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        disabled={isLoading || disabled}
        {...props}
      >
        {isLoading ? (
          <Spinner size={effectiveSize} />
        ) : (
          <>
            {leftIcon && <span className="mr-2">{React.cloneElement(leftIcon, { className: 'h-4 w-4' })}</span>}
            {children}
            {rightIcon && <span className="ml-2">{React.cloneElement(rightIcon, { className: 'h-4 w-4' })}</span>}
          </>
        )}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
