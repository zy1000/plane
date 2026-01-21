"use client";

import { useEffect, useRef } from "react";
import MindElixir from "mind-elixir";
import type { MindElixirData, MindElixirInstance, NodeObj, Operation } from "mind-elixir";
import "mind-elixir/style.css";
import { ALL_EXTENDED_MENU_IDS, findNodeById, getContextMenuVisibility, resolveCaseMode } from "./case-mindmap-menu";

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

    mind.bus.addListener("operation", (op: Operation) => {
      onOperationRef.current?.(op);
    });

    return () => {
      container.removeEventListener("contextmenu", handleRightClick);
      container.removeEventListener("click", handleContainerClick);
      mindRef.current?.destroy?.();
      mindRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!mindRef.current) return;
    mindRef.current.refresh(data);
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
          }
          .tags {
            margin-left: 8px !important;
            display: inline-flex !important;
            flex-shrink: 0 !important;
          }
        `,
        }}
      />
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};
