import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({
  BASE_URL: "http://localhost:8000",
  getArenaWorld: vi.fn().mockResolvedValue({ districts: [], buildings: [], avatars: [], alerts: [], simulated: false }),
  getArenaSession: vi.fn().mockResolvedValue({ session: { game_name: "Minecraft" }, game_bible: { palette: [] } }),
  getArenaFilePanel: vi.fn(), refreshArenaWorld: vi.fn(), checkInArenaWorld: vi.fn(),
}));
import World from "./World";

describe("World SSE reconnect", () => {
  beforeEach(() => {
    localStorage.setItem("onecontext_arena_session_id", "arena-1");
    localStorage.setItem("onecontext_arena_token", "signed-token");
    globalThis.EventSource = class {
      constructor() { globalThis.__worldEventSource = this; }
      close() {}
    };
  });
  it("shows a reconnecting indicator after an SSE disconnect", async () => {
    render(<World />);
    await waitFor(() => expect(globalThis.__worldEventSource).toBeTruthy());
    globalThis.__worldEventSource.onerror();
    expect(await screen.findByText(/Reconnecting to live updates/)).toBeInTheDocument();
  });
});
