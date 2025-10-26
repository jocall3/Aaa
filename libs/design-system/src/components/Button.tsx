import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

/**
 * An internal utility component for rendering a loading spinner. It is used by
 * the Button component when in its `isLoading` state. This component is not
 * exported from the design system library.
 *
 * @param props - The component props.
 * @param props.size - The size of the spinner, corresponding to the button size.
 * @returns The SVG spinner element.
 * @internal
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
      role="status"
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
 * Defines the visual variants of the button component using `class-variance-authority`.
 * This utility generates the appropriate CSS classes based on the button's props,
 * ensuring a consistent and maintainable styling approach that aligns with the
 * design system's token-based styling methodology. The classes suggest a utility-first
 * CSS framework like Tailwind CSS is in use.
 *
 * This configuration is exported to allow consumers to build their own components
 * that compose or extend the Button's styles.
 *
 * @see https://cva.style/docs
 * @public
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      /**
       * @property variant - Determines the visual style of the button.
       */
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      /**
       * @property size - Determines the padding and height of the button.
       */
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
 * Defines the properties for the `Button` component. It extends standard HTML
 * button attributes, allowing passthrough of native props like `onClick`, `type`, etc.
 * It also includes variants from `buttonVariants` for styling and behavior customization.
 *
 * @public
 * @interface ButtonProps
 * @extends React.ButtonHTMLAttributes<HTMLButtonElement>
 * @extends VariantProps<typeof buttonVariants>
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * If `true`, the button will display a spinner and be disabled. This is used
   * to indicate that an action is in progress.
   * @default false
   */
  isLoading?: boolean;

  /**
   * An optional React element to be displayed to the left of the button's content.
   * Typically used for icons. The element will be cloned to apply standard styling.
   */
  leftIcon?: React.ReactElement;

  /**
   * An optional React element to be displayed to the right of the button's content.
   * Typically used for icons. The element will be cloned to apply standard styling.
   */
  rightIcon?: React.ReactElement;
}

/**
 * A foundational, interactive button component for the design system.
 *
 * This component is built to be accessible and customizable, serving as a base for all
 * button elements across the application ecosystem. It ensures consistent styling,
 * behavior, and accessibility. It supports various visual styles (`variant`),
 * sizes (`size`), and states (`isLoading`, `disabled`).
 *
 * @public
 * @component
 * @param props - The props for the Button component.
 * @param ref - A ref to the underlying button element.
 * @returns A styled button element.
 *
 * @example
 * ```tsx
 * import { Button } from '@bank/design-system';
 * // Assuming an icon component is available from a library like lucide-react
 * import { Lock } from 'lucide-react';
 *
 * const MyComponent = () => (
 *   <div style={{ display: 'flex', gap: '1rem' }}>
 *     <Button variant="primary" size="lg" onClick={() => alert('Clicked!')}>
 *       Primary Action
 *     </Button>
 *
 *     <Button variant="secondary" isLoading={true} leftIcon={<Lock />}>
 *       Processing
 *     </Button>
 *
 *     <Button variant="destructive" disabled>
 *       Delete
 *     </Button>
 *   </div>
 * );
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
    // Ensure size has a default value for the spinner, even if not passed,
    // by falling back to the CVA default.
    const effectiveSize = size || 'md';

    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        disabled={isLoading || disabled}
        aria-busy={isLoading}
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
