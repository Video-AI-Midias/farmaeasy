/**
 * Star rating component tests.
 *
 * Tests star selection, hover preview, keyboard navigation and accessibility.
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StarRating } from "./star-rating";

describe("StarRating", () => {
  afterEach(() => {
    cleanup();
  });

  it("should render 5 star buttons", () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
  });

  it("should have correct aria-labels for each star", () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    expect(screen.getByLabelText("Dar 1 estrela")).toBeInTheDocument();
    expect(screen.getByLabelText("Dar 2 estrelas")).toBeInTheDocument();
    expect(screen.getByLabelText("Dar 3 estrelas")).toBeInTheDocument();
    expect(screen.getByLabelText("Dar 4 estrelas")).toBeInTheDocument();
    expect(screen.getByLabelText("Dar 5 estrelas")).toBeInTheDocument();
  });

  it("should call onChange when star is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    await user.click(screen.getByLabelText("Dar 3 estrelas"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("should show filled stars up to current value", () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);

    const buttons = screen.getAllByRole("button");

    // First 3 should be pressed (filled)
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[2]).toHaveAttribute("aria-pressed", "true");

    // Last 2 should not be pressed
    expect(buttons[3]).toHaveAttribute("aria-pressed", "false");
    expect(buttons[4]).toHaveAttribute("aria-pressed", "false");
  });

  it("should handle hover preview", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    const star4 = screen.getByLabelText("Dar 4 estrelas");

    // Hover over star 4
    await user.hover(star4);

    // Stars should visually update (we test by checking the SVG classes would change)
    // The component uses hoverValue state which affects the fill
    // Since we can't easily test CSS classes without snapshot testing,
    // we verify the hover/unhover doesn't break anything
    await user.unhover(star4);

    // Verify component still works after hover
    await user.click(screen.getByLabelText("Dar 2 estrelas"));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("should not call onChange when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={2} onChange={onChange} disabled />);

    const star = screen.getByLabelText("Dar 3 estrelas");

    await user.click(star);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("should disable all buttons when disabled prop is true", () => {
    const onChange = vi.fn();
    render(<StarRating value={2} onChange={onChange} disabled />);

    const buttons = screen.getAllByRole("button");

    for (const button of buttons) {
      expect(button).toBeDisabled();
    }
  });

  it("should handle keyboard navigation with ArrowRight", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={2} onChange={onChange} />);

    const star2 = screen.getByLabelText("Dar 2 estrelas");
    star2.focus();

    await user.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("should handle keyboard navigation with ArrowLeft", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);

    const star3 = screen.getByLabelText("Dar 3 estrelas");
    star3.focus();

    await user.keyboard("{ArrowLeft}");

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("should handle Enter key to select", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    const star4 = screen.getByLabelText("Dar 4 estrelas");
    star4.focus();

    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("should handle Space key to select", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    const star5 = screen.getByLabelText("Dar 5 estrelas");
    star5.focus();

    await user.keyboard(" ");

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("should not go below 1 with ArrowLeft", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={1} onChange={onChange} />);

    const star1 = screen.getByLabelText("Dar 1 estrela");
    star1.focus();

    await user.keyboard("{ArrowLeft}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("should not go above 5 with ArrowRight", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={5} onChange={onChange} />);

    const star5 = screen.getByLabelText("Dar 5 estrelas");
    star5.focus();

    await user.keyboard("{ArrowRight}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("should apply custom className", () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} className="custom-class" />);

    const container = screen.getByLabelText("Avaliacao em estrelas");
    expect(container).toHaveClass("custom-class");
  });

  it("should render different sizes", () => {
    const onChange = vi.fn();

    const { rerender } = render(<StarRating value={0} onChange={onChange} size="sm" />);
    expect(screen.getAllByRole("button")[0]?.querySelector("svg")).toHaveClass("h-5", "w-5");

    rerender(<StarRating value={0} onChange={onChange} size="md" />);
    expect(screen.getAllByRole("button")[0]?.querySelector("svg")).toHaveClass("h-7", "w-7");

    rerender(<StarRating value={0} onChange={onChange} size="lg" />);
    expect(screen.getAllByRole("button")[0]?.querySelector("svg")).toHaveClass("h-9", "w-9");
  });
});
