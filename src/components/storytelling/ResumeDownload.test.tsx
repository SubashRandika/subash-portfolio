import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumeDownload } from "./ResumeDownload";

const local = { href: "/resume.pdf", external: false, pages: 2, size: "99 KB" };

describe("ResumeDownload", () => {
  afterEach(() => vi.useRealTimers());

  it("is a download link that names the file's format, length and size", () => {
    render(<ResumeDownload file={local} />);
    const link = screen.getByRole("link", { name: "Download résumé, PDF, 2 pages, 99 KB" });
    expect(link).toHaveAttribute("href", "/resume.pdf");
    expect(link).toHaveAttribute("download", "Subash-Rodrigo-Resume.pdf");
  });

  it("confirms the download, announces it, then resets", () => {
    vi.useFakeTimers();
    render(<ResumeDownload file={local} />);
    const link = screen.getByRole("link");
    // Keep jsdom from attempting the navigation itself.
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(link).toHaveAttribute("data-state", "sent");
    expect(screen.getByText("Résumé download started.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(link).not.toHaveAttribute("data-state");
    expect(screen.queryByText("Résumé download started.")).toBeNull();
  });

  it("opens a hosted résumé in a new tab instead", () => {
    render(<ResumeDownload file={{ href: "https://example.com/cv.pdf", external: true, pages: null, size: null }} />);
    const link = screen.getByRole("link", { name: /Download résumé, PDF.*opens in a new tab/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).not.toHaveAttribute("download");
  });
});
