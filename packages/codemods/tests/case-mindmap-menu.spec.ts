import { describe, it, expect } from "vitest";
import {
  findNodeById,
  getContextMenuVisibility,
  resolveCaseMode,
} from "../../../apps/web/core/components/qa/cases/case-mindmap-menu";

describe("case-mindmap menu visibility", () => {
  it("should show only text-mode menu items after switching steps->text (direct right click)", () => {
    const nodeId = "case:1";
    const mode = resolveCaseMode({ current: 0, latest: 1 });
    const { allowed } = getContextMenuVisibility({ nodeId, mode });
    expect(allowed).toContain("切换为步骤模式");
    expect(allowed).toContain("新增文本描述");
    expect(allowed).not.toContain("切换为文本模式");
    expect(allowed).not.toContain("新增步骤");
    expect(allowed).not.toContain("新增用例");
  });

  it("should show only text-mode menu items after switching steps->text (click outside then right click)", () => {
    const nodeId = "case:1";
    const mode = resolveCaseMode({ current: 1, latest: 1 });
    const { allowed } = getContextMenuVisibility({ nodeId, mode });
    expect(allowed).toEqual(["新增文本描述", "切换为步骤模式", "删除"]);
  });

  it("should keep right-click menu consistent after multiple mode switches", () => {
    const nodeId = "case:1";
    const modes = [0, 1, 0, 1, 1, 0];
    for (const m of modes) {
      const { allowed } = getContextMenuVisibility({ nodeId, mode: m });
      const hasSwitchToText = allowed.includes("切换为文本模式");
      const hasSwitchToSteps = allowed.includes("切换为步骤模式");
      expect(hasSwitchToText && hasSwitchToSteps).toBe(false);
      if (m === 1) {
        expect(hasSwitchToSteps).toBe(true);
        expect(hasSwitchToText).toBe(false);
      } else {
        expect(hasSwitchToText).toBe(true);
        expect(hasSwitchToSteps).toBe(false);
      }
    }
  });

  it("should find latest node data by id", () => {
    const root: any = {
      id: "me-root",
      children: [
        { id: "module:1", children: [{ id: "case:1", mode: 1, children: [] }] },
        { id: "case:2", mode: 0, children: [] },
      ],
    };
    expect((findNodeById("case:1", root) as any)?.mode).toBe(1);
    expect((findNodeById("case:2", root) as any)?.mode).toBe(0);
    expect(findNodeById("missing", root)).toBe(null);
  });
});

