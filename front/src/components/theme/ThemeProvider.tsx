/**
 * Theme Provider component.
 *
 * Wraps the application with next-themes provider configured for
 * light/dark/system theme support with proper CSS variable integration.
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Theme provider that integrates with CSS variables defined in index.css.
 * Supports light, dark, and system (auto-detect) themes.
 *
 * Theme is persisted in localStorage and synced across tabs.
 * Uses `data-theme` attribute on the html element (Tailwind CSS v4 pattern).
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="farmaeasy-theme"
      themes={["light", "dark"]}
    >
      {children}
    </NextThemesProvider>
  );
}
