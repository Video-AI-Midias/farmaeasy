/**
 * Theme Toggle component tests.
 *
 * Tests theme switching functionality with next-themes integration.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle, ThemeToggleSimple } from "./ThemeToggle";

// Mock matchMedia for next-themes
const mockMatchMedia = (prefersDark: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: prefersDark && query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

// Wrapper with ThemeProvider
function ThemeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem={false}
      storageKey="test-theme"
    >
      {children}
    </NextThemesProvider>
  );
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockMatchMedia(false);
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("should render theme toggle button", async () => {
    render(
      <ThemeWrapper>
        <ThemeToggle />
      </ThemeWrapper>,
    );

    // Wait for hydration
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /alterar tema/i })).toBeInTheDocument();
    });
  });

  it("should render button with correct aria attributes", async () => {
    render(
      <ThemeWrapper>
        <ThemeToggle />
      </ThemeWrapper>,
    );

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /alterar tema/i });
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("aria-haspopup", "menu");
    });
  });

  it("should open dropdown menu on click", async () => {
    const user = userEvent.setup();

    render(
      <ThemeWrapper>
        <ThemeToggle />
      </ThemeWrapper>,
    );

    // Wait for hydration
    await waitFor(() => {
      expect(screen.getByRole("button")).not.toBeDisabled();
    });

    // Click to open dropdown
    await user.click(screen.getByRole("button", { name: /alterar tema/i }));

    // Check menu items
    await waitFor(() => {
      expect(screen.getByText("Claro")).toBeInTheDocument();
      expect(screen.getByText("Escuro")).toBeInTheDocument();
      expect(screen.getByText("Sistema")).toBeInTheDocument();
    });
  });

  it("should show label when showLabel prop is true", async () => {
    render(
      <ThemeWrapper>
        <ThemeToggle showLabel />
      </ThemeWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/tema/i)).toBeInTheDocument();
    });
  });

  it("should render with custom className", async () => {
    render(
      <ThemeWrapper>
        <ThemeToggle className="custom-class" />
      </ThemeWrapper>,
    );

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /alterar tema/i });
      expect(button).toHaveClass("custom-class");
    });
  });
});

describe("ThemeToggleSimple", () => {
  beforeEach(() => {
    mockMatchMedia(false);
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("should render simple toggle button", async () => {
    render(
      <ThemeWrapper>
        <ThemeToggleSimple />
      </ThemeWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  it("should cycle through themes on click", async () => {
    const user = userEvent.setup();

    render(
      <ThemeWrapper>
        <ThemeToggleSimple />
      </ThemeWrapper>,
    );

    // Wait for hydration
    await waitFor(() => {
      expect(screen.getByRole("button")).not.toBeDisabled();
    });

    const button = screen.getByRole("button");

    // Click to cycle to next theme
    await user.click(button);

    // Should update aria-label
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-label", expect.stringContaining("Tema atual"));
    });
  });

  it("should have aria-label with current theme", async () => {
    render(
      <ThemeWrapper>
        <ThemeToggleSimple />
      </ThemeWrapper>,
    );

    await waitFor(() => {
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", expect.stringContaining("Tema atual"));
    });
  });

  it("should apply custom className", async () => {
    render(
      <ThemeWrapper>
        <ThemeToggleSimple className="test-class" />
      </ThemeWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveClass("test-class");
    });
  });
});
