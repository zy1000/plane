/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Play, Plus, Minus } from "lucide-react";
import type { TFlowchartState, TWorkflowFlowchart } from "@/services/project/project-workflow.service";
import {
  computeFlowLayout,
  FLOW_LABEL_GUTTER,
  FLOW_PADDING,
  START_NODE_ID,
  type TFlowEdge,
  type TFlowNode,
} from "./flow-layout";
import { ApprovalRuleBadge, approvalRuleColor } from "./flow-shared";
import { TransitionDetailPanel } from "./transition-detail-panel";

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.4;
const ZOOM_STEP = 0.1;

const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

function GraphNode({ node, dimmed, highlighted }: { node: TFlowNode; dimmed: boolean; highlighted: boolean }) {
  if (node.kind === "start") {
    return (
      <div
        className="flex h-full w-full items-center justify-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/10 text-sm font-semibold text-emerald-600 shadow-sm transition-opacity"
        style={{ opacity: dimmed ? 0.35 : 1 }}
      >
        <Play className="h-3 w-3 fill-current" />
        {node.label}
      </div>
    );
  }
  const color = node.color;
  const isDeleted = !node.state;
  return (
    <div
      className="flex h-full w-full items-center gap-2 overflow-hidden rounded-lg border bg-layer-1 pl-3 pr-2.5 shadow-sm transition-all"
      style={{
        borderColor: highlighted ? "var(--border-color-subtle-1)" : `${color}40`,
        boxShadow: highlighted ? `0 0 0 1.5px var(--stroke-accent-primary)` : undefined,
        opacity: dimmed ? 0.4 : 1,
        borderLeftWidth: 3,
        borderLeftColor: color,
      }}
      title={node.label}
    >
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className={`truncate text-sm font-medium ${isDeleted ? "italic text-tertiary" : "text-primary"}`}>
        {node.label}
      </span>
    </div>
  );
}

export function WorkflowFlowGraph({ flowchart }: { flowchart: TWorkflowFlowchart }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const layout = useMemo(
    () => computeFlowLayout(flowchart.states, flowchart.transitions, availableWidth),
    [flowchart.states, flowchart.transitions, availableWidth]
  );

  const stateById = useMemo(
    () => Object.fromEntries(flowchart.states.map((s) => [s.id, s])) as Record<string, TFlowchartState>,
    [flowchart.states]
  );

  // hover 节点时用于判断相关边/相邻节点
  const neighborByNode = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of layout.edges) {
      if (!map.has(edge.sourceId)) map.set(edge.sourceId, new Set());
      if (!map.has(edge.targetId)) map.set(edge.targetId, new Set());
      map.get(edge.sourceId)!.add(edge.targetId);
      map.get(edge.targetId)!.add(edge.sourceId);
    }
    return map;
  }, [layout.edges]);

  const fitToView = useCallback(() => {
    const el = scrollRef.current;
    if (!el || layout.width === 0 || layout.height === 0) return;
    const next = clampZoom(Math.min(el.clientWidth / layout.width, el.clientHeight / layout.height, 1));
    setZoom(next);
  }, [layout.width, layout.height]);

  // 测量画布可用宽度，宽度变化即重新蛇形换行
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setAvailableWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 切换工作项类型时重置交互态与缩放（换行后宽度已贴合，纵向用滚动，不自动缩小）
  useLayoutEffect(() => {
    setSelectedEdgeId(null);
    setHoveredNodeId(null);
    setHoveredEdgeId(null);
    setZoom(1);
  }, [flowchart.issue_type_id]);

  const selectedEdge = selectedEdgeId ? layout.edges.find((e) => e.id === selectedEdgeId) ?? null : null;
  // 被强调（选中优先，其次悬停）的那条边，用于浮出完整审批规则与高亮端点
  const emphasizedEdge =
    selectedEdge ?? (hoveredEdgeId ? layout.edges.find((e) => e.id === hoveredEdgeId) ?? null : null);

  const isEdgeActive = (edge: TFlowEdge) => {
    if (selectedEdgeId) return edge.id === selectedEdgeId;
    if (hoveredEdgeId) return edge.id === hoveredEdgeId;
    if (hoveredNodeId) return edge.sourceId === hoveredNodeId || edge.targetId === hoveredNodeId;
    return false;
  };
  const isEdgeDimmed = (edge: TFlowEdge) => {
    if (selectedEdgeId) return edge.id !== selectedEdgeId;
    if (hoveredEdgeId) return edge.id !== hoveredEdgeId;
    if (hoveredNodeId) return edge.sourceId !== hoveredNodeId && edge.targetId !== hoveredNodeId;
    return false;
  };
  const isNodeDimmed = (node: TFlowNode) => {
    if (hoveredNodeId) return node.id !== hoveredNodeId && !neighborByNode.get(hoveredNodeId)?.has(node.id);
    if (emphasizedEdge) return emphasizedEdge.sourceId !== node.id && emphasizedEdge.targetId !== node.id;
    return false;
  };
  const isNodeHighlighted = (node: TFlowNode) => {
    if (hoveredNodeId === node.id) return true;
    if (emphasizedEdge) return emphasizedEdge.sourceId === node.id || emphasizedEdge.targetId === node.id;
    return false;
  };

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* 缩放工具条 */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-lg border border-subtle bg-surface-1/90 p-0.5 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
          disabled={zoom <= ZOOM_MIN}
          className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary disabled:opacity-40"
          aria-label="缩小"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-11 text-center text-xs tabular-nums text-secondary">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
          disabled={zoom >= ZOOM_MAX}
          className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors hover:bg-layer-1 hover:text-primary disabled:opacity-40"
          aria-label="放大"
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-border-subtle" />
        <button
          type="button"
          onClick={fitToView}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
          aria-label="适应视图"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          适应
        </button>
      </div>

      {/* 画布（点阵图纸背景）*/}
      <div
        ref={scrollRef}
        onClick={() => setSelectedEdgeId(null)}
        className="flex-1 overflow-auto"
        style={{
          backgroundImage: "radial-gradient(var(--border-color-subtle) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="m-auto" style={{ width: layout.width * zoom, height: layout.height * zoom }}>
          <div
            className="relative"
            style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})`, transformOrigin: "top left" }}
          >
            {/* 状态组泳道（行背景 + 组名）*/}
            {layout.bands.map((band) => (
              <div
                key={band.key}
                className="absolute rounded-xl"
                style={{
                  left: FLOW_PADDING,
                  top: band.y - 12,
                  width: layout.width - FLOW_PADDING * 2,
                  height: band.height + 24,
                  backgroundColor: `${band.color}0d`,
                  border: `1px solid ${band.color}26`,
                }}
              >
                <span
                  className="absolute left-3 top-1/2 inline-flex max-w-[84px] -translate-y-1/2 items-center gap-1.5 truncate text-xs font-semibold"
                  style={{ color: band.color, width: FLOW_LABEL_GUTTER - 24 }}
                  title={band.label}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: band.color }} />
                  <span className="truncate">{band.label}</span>
                </span>
              </div>
            ))}

            {/* 连线层 */}
            <svg
              width={layout.width}
              height={layout.height}
              className="pointer-events-none absolute inset-0 overflow-visible"
            >
              <defs>
                <marker id="wf-arrow" viewBox="0 0 6 6" refX={5} refY={3} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
                  <path d="M0,0 L6,3 L0,6 z" fill="var(--border-color-subtle-1)" />
                </marker>
                <marker
                  id="wf-arrow-active"
                  viewBox="0 0 6 6"
                  refX={5}
                  refY={3}
                  markerWidth={7}
                  markerHeight={7}
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L6,3 L0,6 z" fill="var(--stroke-accent-primary)" />
                </marker>
              </defs>

              {layout.edges.map((edge) => {
                const active = isEdgeActive(edge);
                const dimmed = isEdgeDimmed(edge);
                return (
                  <g key={edge.id} style={{ opacity: dimmed ? 0.2 : 1 }}>
                    {/* 透明加宽命中区，便于悬停 / 点击 */}
                    <path
                      d={edge.path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={18}
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onMouseEnter={() => setHoveredEdgeId(edge.id)}
                      onMouseLeave={() => setHoveredEdgeId((id) => (id === edge.id ? null : id))}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEdgeId(edge.id);
                      }}
                    />
                    <path
                      d={edge.path}
                      fill="none"
                      stroke={active ? "var(--stroke-accent-primary)" : "var(--border-color-subtle-1)"}
                      strokeWidth={active ? 2.25 : 1.5}
                      markerEnd={active ? "url(#wf-arrow-active)" : "url(#wf-arrow)"}
                      className="transition-[stroke,stroke-width]"
                    />
                  </g>
                );
              })}
            </svg>

            {/* 节点层 */}
            {layout.nodes.map((node, index) => (
              <div
                key={node.id}
                className="animate-slide-up absolute"
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                  animationDelay: `${Math.min(index * 40, 320)}ms`,
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
              >
                <GraphNode node={node} dimmed={isNodeDimmed(node)} highlighted={isNodeHighlighted(node)} />
              </div>
            ))}

            {/* 审批规则圆点（连线中点）：默认小彩点，悬停 / 选中时浮出完整规则 */}
            {layout.edges.map((edge) => {
              const active = isEdgeActive(edge);
              const dimmed = isEdgeDimmed(edge);
              const color = approvalRuleColor(edge.transition);
              const showRule = emphasizedEdge?.id === edge.id;
              return (
                <div
                  key={`dot-${edge.id}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: edge.labelX, top: edge.labelY, zIndex: showRule ? 20 : 2 }}
                >
                  {showRule ? (
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface-1 shadow-md">
                      <ApprovalRuleBadge transition={edge.transition} />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setHoveredEdgeId(edge.id)}
                    onMouseLeave={() => setHoveredEdgeId((id) => (id === edge.id ? null : id))}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEdgeId(edge.id);
                    }}
                    aria-label={`审批规则：${edge.transition.approval_rule_label}`}
                    className="grid h-5 w-5 place-items-center rounded-full transition-opacity"
                    style={{ opacity: dimmed ? 0.25 : 1 }}
                  >
                    <span
                      className="block rounded-full transition-all"
                      style={{
                        width: active ? 11 : 8,
                        height: active ? 11 : 8,
                        backgroundColor: color,
                        border: "1.5px solid var(--background-color-surface-1)",
                        boxShadow: active ? `0 0 0 2px ${color}55` : `0 0 0 1px ${color}33`,
                      }}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedEdge ? (
        <TransitionDetailPanel
          transition={selectedEdge.transition}
          fromState={selectedEdge.sourceId === START_NODE_ID ? null : stateById[selectedEdge.sourceId] ?? null}
          toState={selectedEdge.transition.to_state_id ? stateById[selectedEdge.transition.to_state_id] ?? null : null}
          isInitial={selectedEdge.sourceId === START_NODE_ID}
          onClose={() => setSelectedEdgeId(null)}
        />
      ) : null}
    </div>
  );
}
