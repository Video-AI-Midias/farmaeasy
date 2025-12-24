import { type ClassValue, clsx } from "clsx";
import type React from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts plain text with URLs into JSX with clickable links.
 * Detects URLs in text and wraps them in anchor tags.
 * Also preserves line breaks.
 *
 * @param text - The text to process
 * @param linkClassName - Optional CSS class for links (default: "text-primary underline hover:text-primary/80")
 * @returns JSX with clickable links and preserved line breaks
 */
export function renderTextWithLinks(
  text: string,
  linkClassName = "text-primary underline hover:text-primary/80",
): React.ReactNode {
  if (!text) return null;

  // Regex to detect URLs (http, https, www)
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);
  const matches = text.match(urlRegex);

  if (!matches) {
    // No URLs, just preserve line breaks
    return text.split("\n").map((line, i, arr) => (
      <span key={`line-${i}-${line.slice(0, 10)}`}>
        {line}
        {i < arr.length - 1 && <br />}
      </span>
    ));
  }

  let urlCounter = 0;
  let textCounter = 0;

  return parts.map((part) => {
    // Check if this part is a URL
    if (matches.includes(part)) {
      const href = part.startsWith("http") ? part : `https://${part}`;
      const key = `link-${urlCounter++}-${part.slice(0, 20)}`;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {part}
        </a>
      );
    }
    // Preserve line breaks in text parts
    const key = `text-${textCounter++}`;
    return (
      <span key={key}>
        {part.split("\n").map((line, i, arr) => (
          <span key={`${key}-line-${i}-${line.slice(0, 10)}`}>
            {line}
            {i < arr.length - 1 && <br />}
          </span>
        ))}
      </span>
    );
  });
}
