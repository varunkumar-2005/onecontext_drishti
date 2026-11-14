import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileDrawer } from "./World";

describe("FileDrawer", () => {
  it("shows metadata only: actors, alert evidence, quests, commits, and memories", () => {
    render(<FileDrawer onClose={() => {}} panel={{ path: "backend/main.py", current_actors: ["Ada"], linked_quests: [{ id: "q", themed_title: "Patch gateway" }], recent_commits: [{ ref: "abc", created_at: "today" }], open_alerts: [{ kind: "collision", evidence: { actors: ["Ada"] } }], related_memories: [{ id: "m", text: "Use signed events." }] }} />);
    expect(screen.getAllByText("Ada", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText("Patch gateway")).toBeInTheDocument();
    expect(screen.getByText(/abc/)).toBeInTheDocument();
    expect(screen.getByText(/collision/)).toBeInTheDocument();
    expect(screen.getByText("Use signed events.")).toBeInTheDocument();
  });
});
