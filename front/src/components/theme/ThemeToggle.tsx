/**
 * Theme Toggle component.
 *
 * Provides a dropdown menu to switch between light, dark, and system themes
 * with smooth animations and accessible controls.
 */

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const themes = [
  {
    value: "light",
    label: "Claro",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Escuro",
    icon: Moon,
  },
  {
    value: "system",
    label: "Sistema",
    icon: Laptop,
  },
] as const;

interface ThemeToggleProps {
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: "default" | "sm" | "lg";
  /** Show label on button (for mobile menu) */
  showLabel?: boolean;
}

/**
 * Theme toggle with dropdown menu for selecting light/dark/system themes.
 *
 * Features:
 * - Animated icon transitions
 * - Current theme indicator with checkmark
 * - Keyboard accessible
 * - Smooth theme transitions
 */
export function ThemeToggle({ className, size = "default", showLabel = false }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Show placeholder during SSR/hydration
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size={size === "default" ? "icon" : size}
        className={cn("relative", className)}
        disabled
      >
        <div className="h-5 w-5 animate-pulse rounded-full bg-muted" />
        {showLabel && <span className="ml-2 animate-pulse">Tema</span>}
        <span className="sr-only">Carregando tema</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={size === "default" ? "icon" : size}
          className={cn(
            "relative",
            // Smooth icon transition with color inheritance on hover
            "[&_svg]:transition-all [&_svg]:duration-300",
            "[&_svg]:text-muted-foreground",
            "hover:[&_svg]:text-accent-foreground",
            showLabel && "justify-start gap-2 px-3",
            className,
          )}
          aria-label="Alterar tema"
        >
          {/* Sun icon - visible in light mode */}
          <Sun
            className={cn(
              "h-5 w-5",
              resolvedTheme === "dark"
                ? "rotate-90 scale-0 opacity-0"
                : "rotate-0 scale-100 opacity-100",
              !showLabel && "absolute",
            )}
          />
          {/* Moon icon - visible in dark mode */}
          <Moon
            className={cn(
              "h-5 w-5",
              resolvedTheme === "dark"
                ? "rotate-0 scale-100 opacity-100"
                : "-rotate-90 scale-0 opacity-0",
              !showLabel && "absolute",
            )}
          />
          {showLabel && (
            <span className="flex-1 text-left">
              {themes.find((t) => t.value === theme)?.label ?? "Tema"}
            </span>
          )}
          <span className="sr-only">Alterar tema (atual: {theme})</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {themes.map((t) => {
          const Icon = t.icon;
          const isActive = theme === t.value;

          return (
            <DropdownMenuItem
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={cn(
                "flex cursor-pointer items-center gap-2 transition-colors",
                "[&_svg]:transition-colors [&_svg]:duration-200",
                isActive && "bg-primary text-primary-foreground",
              )}
            >
              <Icon
                className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-foreground")}
              />
              <span className="flex-1">{t.label}</span>
              {isActive && <Check className="h-4 w-4 text-primary-foreground" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Simple theme toggle button that cycles through themes.
 * Use this for compact layouts like mobile menus.
 */
export function ThemeToggleSimple({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cycleTheme = () => {
    const order: readonly ["light", "dark", "system"] = ["light", "dark", "system"];
    const currentTheme = theme ?? "system";
    const currentIndex = order.indexOf(currentTheme as (typeof order)[number]);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % order.length;
    const nextTheme = order[nextIndex] ?? "system";
    setTheme(nextTheme);
  };

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className={className} disabled>
        <div className="h-5 w-5 animate-pulse rounded-full bg-muted" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      className={cn(
        "relative overflow-hidden",
        // Icon color transitions
        "[&_svg]:transition-all [&_svg]:duration-300",
        "[&_svg]:text-muted-foreground",
        "hover:[&_svg]:text-accent-foreground",
        className,
      )}
      aria-label={`Tema atual: ${theme}. Clique para alternar.`}
    >
      <Sun
        className={cn(
          "absolute h-5 w-5",
          resolvedTheme === "dark"
            ? "rotate-90 scale-0 opacity-0"
            : "rotate-0 scale-100 opacity-100",
        )}
      />
      <Moon
        className={cn(
          "absolute h-5 w-5",
          resolvedTheme === "dark"
            ? "rotate-0 scale-100 opacity-100"
            : "-rotate-90 scale-0 opacity-0",
        )}
      />
    </Button>
  );
}
