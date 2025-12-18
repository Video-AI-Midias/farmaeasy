/**
 * LessonReviewOverlay component tests.
 *
 * Tests overlay behavior, countdown timer, auto-focus, and submission.
 */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonReviewOverlay } from "./LessonReviewOverlay";

describe("LessonReviewOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("should not render when isOpen is false", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={false}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
      />,
    );

    expect(screen.queryByText("Avalie esta aula")).not.toBeInTheDocument();
  });

  it("should render when isOpen is true", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
      />,
    );

    expect(screen.getByText("Avalie esta aula")).toBeInTheDocument();
    expect(screen.getByText('"Test Lesson"')).toBeInTheDocument();
  });

  it("should show star rating component", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
      />,
    );

    expect(screen.getByLabelText("Avaliacao em estrelas")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Dar \d+ estrela/)).toHaveLength(5);
  });

  it("should show textarea for comment", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
      />,
    );

    expect(screen.getByPlaceholderText(/O que achou da aula/)).toBeInTheDocument();
  });

  it("should show skip and submit buttons", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
      />,
    );

    expect(screen.getByRole("button", { name: /pular/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar review/i })).toBeInTheDocument();
  });

  it("should disable submit button when rating is 0", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
      />,
    );

    expect(screen.getByRole("button", { name: /enviar review/i })).toBeDisabled();
  });

  it("should enable submit button when rating is selected", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
      />,
    );

    // Select 4 stars
    await user.click(screen.getByLabelText("Dar 4 estrelas"));

    expect(screen.getByRole("button", { name: /enviar review/i })).not.toBeDisabled();
  });

  it("should call onClose when skip button is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
      />,
    );

    await user.click(screen.getByRole("button", { name: /pular/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should call onSubmit with rating and comment when submit is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
      />,
    );

    // Select 5 stars
    await user.click(screen.getByLabelText("Dar 5 estrelas"));

    // Type comment
    const textarea = screen.getByPlaceholderText(/O que achou da aula/);
    await user.type(textarea, "Excelente aula!");

    // Submit
    await user.click(screen.getByRole("button", { name: /enviar review/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(5, "Excelente aula!");
  });

  it("should show countdown indicator initially", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
        countdownSeconds={10}
      />,
    );

    expect(screen.getByText(/Fechando em 10s/)).toBeInTheDocument();
  });

  it("should countdown from initial value", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
        countdownSeconds={5}
      />,
    );

    expect(screen.getByText(/Fechando em 5s/)).toBeInTheDocument();

    // Advance 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.getByText(/Fechando em 4s/)).toBeInTheDocument();
    });

    // Advance 2 more seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.getByText(/Fechando em 2s/)).toBeInTheDocument();
    });
  });

  it("should call onClose when countdown reaches 0", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
        countdownSeconds={3}
      />,
    );

    // Advance 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("should cancel countdown when user starts typing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
        countdownSeconds={10}
      />,
    );

    expect(screen.getByText(/Fechando em 10s/)).toBeInTheDocument();

    // Type in textarea
    const textarea = screen.getByPlaceholderText(/O que achou da aula/);
    await user.type(textarea, "a");

    // Countdown indicator should disappear
    expect(screen.queryByText(/Fechando em/)).not.toBeInTheDocument();

    // Even after advancing time, onClose should not be called
    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("should cancel countdown when user interacts with rating", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
        countdownSeconds={10}
      />,
    );

    expect(screen.getByText(/Fechando em 10s/)).toBeInTheDocument();

    // Click a star
    await user.click(screen.getByLabelText("Dar 3 estrelas"));

    // Countdown indicator should disappear
    expect(screen.queryByText(/Fechando em/)).not.toBeInTheDocument();

    // Even after advancing time, onClose should not be called
    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("should reset state when reopened", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
        countdownSeconds={10}
      />,
    );

    // Advance time
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(screen.getByText(/Fechando em 7s/)).toBeInTheDocument();
    });

    // Close
    rerender(
      <LessonReviewOverlay
        isOpen={false}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
        countdownSeconds={10}
      />,
    );

    // Reopen
    rerender(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
        countdownSeconds={10}
      />,
    );

    // Should reset to 10 seconds
    await waitFor(() => {
      expect(screen.getByText(/Fechando em 10s/)).toBeInTheDocument();
    });
  });

  it("should show loading state during submission", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();

    // Create a promise that we control
    let resolveSubmit: () => void = () => {};
    const onSubmit = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(
      <LessonReviewOverlay
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        lessonTitle="Test Lesson"
      />,
    );

    // Select rating
    await user.click(screen.getByLabelText("Dar 4 estrelas"));

    // Submit
    await user.click(screen.getByRole("button", { name: /enviar review/i }));

    // Buttons should be disabled during submission
    expect(screen.getByRole("button", { name: /pular/i })).toBeDisabled();

    // Resolve the submission
    await act(async () => {
      resolveSubmit();
    });
  });
});
