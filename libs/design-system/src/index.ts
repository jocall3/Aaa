/**
 * @fileoverview This is the main entry point for the Design System library.
 * It exports all the necessary components, themes, hooks, and utilities
 * to be consumed by micro-frontend applications. Adhering to the Hexagonal
 * Architecture principles at a frontend level, this library acts as a foundational
 * adapter, providing a consistent UI implementation that applications can use
 * without concerning themselves with the specific styling details.
 *
 * All exports are meticulously documented with TSDoc to meet the 'Docs-as-Code'
 * and CI enforcement standards.
 *
 * @version 1.0.0
 * @license MIT
 */

// --- THEME ---
/**
 * @module theme
 * @description Exports theme-related providers, hooks, and configuration objects.
 * This includes the main ThemeProvider for wrapping applications, the default theme object,
 * and individual theme scales like colors, typography, and spacing.
 */
export * from './theme/GlobalStyles';
export * from './theme/ThemeProvider';
export * from './theme/theme';
export * from './theme/colors';
export * from './theme/typography';
export * from './theme/spacing';
export * from './theme/breakpoints';
export * from './theme/shadows';

// --- COMPONENTS ---
/**
 * @module components
 * @description Re-exports all shared UI components from the component library.
 * Each component is self-contained and styled according to the design system's theme.
 */
export * from './components/Alert';
export * from './components/Avatar';
export * from './components/Button';
export * from './components/Card';
export * from './components/Checkbox';
export * from './components/Grid';
export * from './components/Header';
export * from './components/Icon';
export * from './components/Input';
export * from './components/Layout';
export * from './components/Modal';
export * from './components/Select';
export * from './components/Spinner';
export * from './components/Table';
export * from './components/Tabs';
export * from './components/Tooltip';
export * from './components/Typography';

// --- HOOKS ---
/**
 * @module hooks
 * @description Exports custom React hooks that provide helpful utilities
 * within the context of the design system, such as accessing the current theme.
 */
export * from './hooks/useTheme';
export * from './hooks/useBreakpoint';

// --- UTILS ---
/**
 * @module utils
 * @description Provides utility functions that can be used across different
 * applications, often related to theme manipulation (e.g., color helpers).
 */
export * from './utils/colorUtils';
export * from './utils/styleUtils';


// --- TYPES ---
/**
 * @module types
 * @description Exports common TypeScript types and interfaces used by the
 * design system's components and theme. This ensures type safety and
 * consistency when consuming the library.
 */
export * from './types/common';
export * from './types/theme';
