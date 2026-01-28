"use client";

import { useEffect, useRef } from "react";
import MindElixir from "mind-elixir";
import type { MindElixirData, MindElixirInstance, NodeObj, Operation } from "mind-elixir";
import "mind-elixir/style.css";
import { ALL_EXTENDED_MENU_IDS, findNodeById, getContextMenuVisibility, resolveCaseMode } from "./case-mindmap-menu";

const generateMainBranch = function (this: any, { pT, pL, pW, pH, cT, cL, cW, cH, direction }: any) {
  let x1 = pL + pW / 2;
  const y1 = pT + pH / 2;
  let x2;
  if (direction === "lhs") {
    x2 = cL + cW;
  } else {
    x2 = cL;
  }
  const y2 = cT + cH / 2;
  const root = this.map.querySelector("me-root");
  if (this.direction === MindElixir.SIDE) {
    if (direction === "lhs") {
      x1 = x1 - root.offsetWidth / 8;
    } else {
      x1 = x1 + root.offsetWidth / 8;
    }
  }
  return `M ${x1} ${y1} V ${y2 > y1 ? y2 - 20 : y2 + 20} C ${x1} ${y2} ${x1} ${y2} ${
    x2 > x1 ? x1 + 20 : x1 - 20
  } ${y2} H ${x2}`;
};

const generateSubBranch = function (this: any, { pT, pL, pW, pH, cT, cL, cW, cH, direction, isFirst }: any) {
  const GAP = 30;
  const TURNPOINT_R = 8;
  let y1;
  if (isFirst) {
    y1 = pT + pH / 2;
  } else {
    y1 = pT + pH;
  }
  const y2 = cT + cH;
  let x1 = 0;
  let x2 = 0;
  let xMiddle = 0;
  if (direction === "lhs") {
    x1 = pL + GAP;
    x2 = cL;
    xMiddle = cL + cW;
  } else if (direction === "rhs") {
    x1 = pL + pW - GAP;
    x2 = cL + cW;
    xMiddle = cL;
  }

  if (y2 < y1 + 50 && y2 > y1 - 50) {
    // draw straight line if the distance is between +-50
    return `M ${x1} ${y1} H ${xMiddle} V ${y2} H ${x2}`;
  } else if (y2 >= y1) {
    // child bottom lower than parent
    return `M ${x1} ${y1} H ${xMiddle} V ${y2 - TURNPOINT_R} A ${TURNPOINT_R} ${TURNPOINT_R} 0 0 ${
      x1 > x2 ? 1 : 0
    } ${x1 > x2 ? xMiddle - TURNPOINT_R : xMiddle + TURNPOINT_R} ${y2} H ${x2}`;
  } else {
    // child bottom higher than parent
    return `M ${x1} ${y1} H ${xMiddle} V ${y2 + TURNPOINT_R} A ${TURNPOINT_R} ${TURNPOINT_R} 0 0 ${
      x1 > x2 ? 0 : 1
    } ${x1 > x2 ? xMiddle - TURNPOINT_R : xMiddle + TURNPOINT_R} ${y2} H ${x2}`;
  }
};

type Props = {
  data: MindElixirData;
  editable?: boolean;
  before?: Record<string, any>;
  onOperation?: (op: Operation) => void;
  onContextAction?: (action: string, node: NodeObj) => void | Promise<void>;
};

export const CaseMindmap = ({ data, editable = true, before, onOperation, onContextAction }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mindRef = useRef<MindElixirInstance | null>(null);
  const decorateScheduledRef = useRef(false);
  const decorateTags = () => {
    const container = containerRef.current;
    if (!container) return;
    const map: Record<string, string> = {
      模块: "module",
      用例: "case",
      前置条件: "precondition",
      备注: "remark",
      文本描述: "text_description",
      步骤描述: "step_description",
      预期结果: "expected_result",
    };
    const spans = container.querySelectorAll(".tags span");
    spans.forEach((el) => {
      const text = (el.textContent || "").trim();
      const key = map[text];
      if (key) {
        if ((el as HTMLElement).dataset.qaTag !== key) (el as HTMLElement).dataset.qaTag = key;
      } else {
        if ((el as HTMLElement).dataset.qaTag) delete (el as HTMLElement).dataset.qaTag;
      }
    });
  };
  const decorateExpandButtons = () => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = container.querySelector(".map-canvas") as HTMLElement | null;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const buttons = canvas.querySelectorAll("me-parent > me-epd") as NodeListOf<HTMLElement>;
    buttons.forEach((btn) => {
      const parent = btn.closest("me-parent") as HTMLElement | null;
      if (!parent) return;
      const children = parent.querySelector(":scope > me-children") as HTMLElement | null;
      if (!children) return;
      const sideRoot = parent.closest(".lhs, .rhs") as HTMLElement | null;
      const isLhs = !!sideRoot && sideRoot.classList.contains("lhs");
      const parentRect = parent.getBoundingClientRect();
      const childrenRect = children.getBoundingClientRect();
      const y1 = (parentRect.top + parentRect.bottom) / 2 - canvasRect.top;
      let xStart = 0;
      let xEnd = 0;
      if (isLhs) {
        xStart = parentRect.left - canvasRect.left;
        xEnd = childrenRect.right - canvasRect.left;
      } else {
        xStart = parentRect.right - canvasRect.left;
        xEnd = childrenRect.left - canvasRect.left;
      }
      if (!Number.isFinite(xStart) || !Number.isFinite(xEnd) || !Number.isFinite(y1)) return;
      const centerX = (xStart + xEnd) / 2;
      const centerY = y1 - 4;
      const style = btn.style;
      style.position = "absolute";
      style.left = `${centerX}px`;
      style.top = `${centerY}px`;
      style.transform = "translate(-50%, -50%)";
      style.zIndex = "50";
      style.pointerEvents = "auto";
    });
  };
  const decorateLines = () => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = container.querySelector(".map-canvas") as HTMLElement | null;
    if (!canvas) return;

    // Define colors for each level
    // Level 1: Main branch lines (Root -> Level 1)
    // Level 2: Sub branch lines (Level 1 -> Level 2)
    // ...
    const colors = ["#4f46e5", "#0ea5e9", "#22c55e", "#f97316", "#ec4899", "#a855f7", "#eab308"];

    // 1. Process Main Branch Lines (Level 1)
    // These lines are in .lines SVG and connect Root to Level 1 nodes
    const mainPaths = canvas.querySelectorAll(".lines path") as NodeListOf<SVGPathElement>;
    if (mainPaths.length > 0) {
      const level1Color = colors[0];
      mainPaths.forEach((path) => {
        path.style.stroke = level1Color;
      });
    }

    // 2. Process Sub Branch Lines (Level 2+)
    // These lines are in .subLines SVG
    // They correspond to nodes that are descendants of me-children
    const subPaths = canvas.querySelectorAll(".subLines path") as NodeListOf<SVGPathElement>;
    if (subPaths.length === 0) return;

    // Find all me-parent nodes that are inside me-children (i.e. Level 2+)
    // The order of these nodes in DOM should match the order of paths in .subLines
    const allParents = Array.from(canvas.querySelectorAll("me-parent"));
    const subNodeParents = allParents.filter((el) => el.closest("me-children"));

    subNodeParents.forEach((parent, index) => {
      if (index >= subPaths.length) return;

      // Calculate depth based on nesting of me-children
      // Level 2 node is inside 1 me-children (depth 1 relative to Level 1)
      // Level 3 node is inside 2 me-children (depth 2)
      let depth = 0;
      let curr = parent.parentElement;
      while (curr && curr !== canvas) {
        if (curr.tagName.toLowerCase() === "me-children") {
          depth++;
        }
        curr = curr.parentElement;
      }

      // depth starts at 1 for Level 2 nodes.
      // We want Level 2 lines to have a different color from Level 1 lines.
      // Level 1 used colors[0].
      // So let's use colors[depth] or colors[depth % len]
      // If depth=1 (Level 2), use colors[1].
      
      const colorIndex = depth % colors.length;
      const color = colors[colorIndex];
      
      const path = subPaths[index];
      if (path) {
        path.style.stroke = color;
      }
    });
  };
  const decorateAll = () => {
    decorateTags();
    decorateExpandButtons();
    decorateLines();
  };
  const scheduleDecorateTags = () => {
    if (decorateScheduledRef.current) return;
    decorateScheduledRef.current = true;
    requestAnimationFrame(() => {
      decorateScheduledRef.current = false;
      decorateAll();
    });
  };

  const onOperationRef = useRef(onOperation);
  onOperationRef.current = onOperation;

  const onContextActionRef = useRef(onContextAction);
  onContextActionRef.current = onContextAction;

  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!containerRef.current) return;
    if (mindRef.current) return;

    const container = containerRef.current;
    const observer = new MutationObserver(() => scheduleDecorateTags());
    observer.observe(container, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    const handleResize = () => scheduleDecorateTags();
    window.addEventListener("resize", handleResize);

    const handleRightClick = (e: Event) => {
      const target = e.target as HTMLElement;
      // Check if clicked element is a node or inside a node
      const isNode = target.tagName === "ME-TPC" || target.closest("me-tpc");
      const menus = document.querySelectorAll(".context-menu");

      if (!isNode) {
        // If clicking on background, hide menu
        menus.forEach((m) => ((m as HTMLElement).style.display = "none"));
        return;
      }

      menus.forEach((m) => {
        (m as HTMLElement).style.visibility = "hidden";
      });

      setTimeout(() => {
        const menus = document.querySelectorAll(".context-menu");
        menus.forEach((m) => {
          (m as HTMLElement).style.display = "";

          const tpc = (target.tagName === "ME-TPC" ? target : target.closest("me-tpc")) as any;
          const clickedNode = (tpc?.nodeObj || null) as NodeObj | null;
          const id = clickedNode?.id ? String(clickedNode.id) : "";

          const latestNode = findNodeById(id, dataRef.current?.nodeData) || clickedNode;
          const mode = resolveCaseMode({
            current: (clickedNode as any)?.mode,
            latest: (latestNode as any)?.mode,
          });
          const { allowed, deleteLabel } = getContextMenuVisibility({ nodeId: id, mode });

          const items = m.querySelectorAll("li");
          items.forEach((item) => {
            const el = item as HTMLElement;
            const itemId = el.id ? el.id.trim() : "";
            if (ALL_EXTENDED_MENU_IDS.includes(itemId as any)) {
              if (allowed.includes(itemId)) {
                el.style.display = "";
                if (itemId === "删除") el.innerText = deleteLabel;
              } else {
                el.style.display = "none";
              }
            }
          });

          (m as HTMLElement).style.visibility = "visible";
        });
      }, 0);
    };

    const handleContainerClick = (e: Event) => {
      // If clicking inside context menu, do nothing
      if ((e.target as HTMLElement).closest(".context-menu")) return;
      
      const menus = document.querySelectorAll(".context-menu");
      menus.forEach((m) => ((m as HTMLElement).style.display = "none"));
    };

    container.addEventListener("contextmenu", handleRightClick);
    container.addEventListener("click", handleContainerClick);

    const handleContextClick = (action: string) => {
      onContextActionRef.current?.(action, mindRef.current?.currentNode?.nodeObj as any);
      const menus = document.querySelectorAll(".context-menu");
      menus.forEach((m) => ((m as HTMLElement).style.display = "none"));
    };

    const mind = new MindElixir({
      el: containerRef.current,
      direction: MindElixir.RIGHT,
      generateMainBranch,
      generateSubBranch,
      draggable: editable,
      editable,
      contextMenu: {
        focus: false,
        link: false,
        extend: [
          { name: "新增用例", key: "", onclick: () => handleContextClick("add_case") },
          { name: "新增步骤", key: "", onclick: () => handleContextClick("add_step") },
          { name: "在上方插入步骤", key: "", onclick: () => handleContextClick("insert_step_above") },
          { name: "在下方插入步骤", key: "", onclick: () => handleContextClick("insert_step_below") },
          { name: "新增前置条件", key: "", onclick: () => handleContextClick("add_precondition") },
          { name: "新增文本描述", key: "", onclick: () => handleContextClick("add_text_description") },
          { name: "新增备注", key: "", onclick: () => handleContextClick("add_remark") },
          { name: "切换为步骤模式", key: "", onclick: () => handleContextClick("switch_to_steps") },
          { name: "切换为文本模式", key: "", onclick: () => handleContextClick("switch_to_text") },
          { name: "重命名模块", key: "", onclick: () => handleContextClick("rename_module") },
          { name: "删除", key: "", onclick: () => handleContextClick("delete_node") },
        ],
      },
      toolBar: false,
      keypress: false,
      overflowHidden: false,
      before,
    } as any);

    mind.init(data);
    mindRef.current = mind;
    scheduleDecorateTags();

    mind.bus.addListener("operation", (op: Operation) => {
      onOperationRef.current?.(op);
    });

    return () => {
      container.removeEventListener("contextmenu", handleRightClick);
      container.removeEventListener("click", handleContainerClick);
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      mindRef.current?.destroy?.();
      mindRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!mindRef.current) return;
    mindRef.current.refresh(data);
    scheduleDecorateTags();
    if (isFirstRender.current) {
      try {
        (mindRef.current as any)?.toCenter?.();
      } catch {}
      isFirstRender.current = false;
    }
  }, [data]);

  useEffect(() => {
    if (!mindRef.current) return;
    if (editable) mindRef.current.enableEdit();
    else mindRef.current.disableEdit();
  }, [editable]);

  return (
    <div className="h-full w-full">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .context-menu #cm-add_child,
          .context-menu #cm-add_parent,
          .context-menu #cm-add_sibling,
          .context-menu #cm-remove_child,
          .context-menu #cm-up,
          .context-menu #cm-down,
          .context-menu #cm-summary {
            display: none !important;
          }
          me-tpc {
            display: flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            border-radius: 8px !important;
          }
          me-epd {
            transition: left 0.2s ease, top 0.2s ease, transform 0.2s ease;
          }
          me-root {
            border-radius: 8px !important;
            background-color: #7b73bf !important;
          }
          me-root me-tpc {
            background-color: #7b73bf !important;
          }
          .tags {
            margin-left: 8px !important;
            display: inline-flex !important;
            flex-shrink: 0 !important;
          }
          .tags span[data-qa-tag="module"] {
            background: rgba(14, 165, 233, 0.18) !important;
            color: #0369a1 !important;
          }
          .tags span[data-qa-tag="case"] {
            background: rgba(34, 197, 94, 0.18) !important;
            color: #166534 !important;
          }
          .tags span[data-qa-tag="precondition"] {
            background: rgba(245, 158, 11, 0.2) !important;
            color: #92400e !important;
          }
          .tags span[data-qa-tag="remark"] {
            background: rgba(236, 72, 153, 0.18) !important;
            color: #9d174d !important;
          }
          .tags span[data-qa-tag="text_description"] {
            background: rgba(139, 92, 246, 0.18) !important;
            color: #5b21b6 !important;
          }
          .tags span[data-qa-tag="step_description"] {
            background: rgba(148, 163, 184, 0.25) !important;
            color: #334155 !important;
          }
          .tags span[data-qa-tag="expected_result"] {
            background: #ffb3fb !important;
            color: #4d0049 !important;
          }
        `,
        }}
      />
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};
