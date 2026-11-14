import { describe, expect, it } from "vitest";
import { applyWorldDelta } from "./worldState";
describe("world deltas", () => { it("updates data without moving an existing building", () => { const before = { buildings: [{ path: "a.py", grid: [1, 2], heat: 0 }], avatars: [], alerts: [] }; const next = applyWorldDelta(before, { buildings: [{ path: "a.py", heat: 3 }], alerts: [], avatars: [] }); expect(next.buildings[0]).toMatchObject({ grid: [1, 2], heat: 3 }); }); });
