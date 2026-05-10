import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach } from "vitest";
import { useOfficeStore } from "@/store/office-store";
import { TopBar } from "../TopBar";

function renderWithRouter(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TopBar />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useOfficeStore.setState({
    connectionStatus: "connected",
    connectionError: null,
    currentPage: "office",
    globalMetrics: {
      activeAgents: 1,
      totalAgents: 3,
      totalTokens: 0,
      tokenRate: 0,
      collaborationHeat: 0,
    },
  });
});

describe("TopBar navigation", () => {
  it("renders Office, Chat, and Console menu items", () => {
    renderWithRouter();
    expect(screen.getByRole("button", { name: "办公室" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "控制台" })).toBeInTheDocument();
  });

  it("highlights Office when current page is office", () => {
    renderWithRouter();
    const btn = screen.getByRole("button", { name: "办公室" });
    expect(btn.className).toContain("text-gray-900");
  });

  it("highlights Console when current page is console", () => {
    useOfficeStore.setState({ currentPage: "dashboard" });
    renderWithRouter(["/dashboard"]);
    const btn = screen.getByRole("button", { name: "控制台" });
    expect(btn.className).toContain("text-gray-900");
  });

  it("highlights Chat when current page is chat", () => {
    useOfficeStore.setState({ currentPage: "chat" });
    renderWithRouter(["/chat"]);
    const btn = screen.getByRole("button", { name: "聊天" });
    expect(btn.className).toContain("text-gray-900");
  });
});
