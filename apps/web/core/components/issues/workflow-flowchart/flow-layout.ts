/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFlowchartState, TFlowchartTransition } from "@/services/project/project-workflow.service";

export const START_NODE_ID = "__start__";
const START_GROUP = "__start__";
const UNKNOWN_GROUP = "__unknown__";

// 渲染层用于定位组名的常量（与下方内部常量保持一致）
export const FLOW_PADDING = 40;
export const FLOW_LABEL_GUTTER = 104;

// 节点与画布尺寸常量（纯布局，渲染层按此绝对定位）
const NODE_W = 176;
const NODE_H = 48;
const COL_GAP = 96; // 同组内列间空隙
const INTRA_ROW_GAP = 24; // 同组换行时的行距
const BAND_GAP = 112; // 组（状态组泳道）之间的间距，兼作连线走线通道
const PADDING = FLOW_PADDING; // 画布内边距
const LABEL_GUTTER = FLOW_LABEL_GUTTER; // 左侧组名留白
const FALLBACK_WIDTH = 900; // 容器宽未知时的回退宽度
const CORNER_RADIUS = 12; // 正交连线拐角圆角
const TRACK_GAP = 15; // 通道内并行走线的间距
const CHANNEL_OFFSET = 26; // 连线离开节点进入通道的距离

const COL_PITCH = NODE_W + COL_GAP;

// 状态组泳道顺序与展示信息（按 Plane 规范的状态组顺序）
const GROUP_ORDER = [START_GROUP, "backlog", "unstarted", "started", "completed", "cancelled", UNKNOWN_GROUP];
const GROUP_META: Record<string, { label: string; color: string }> = {
  [START_GROUP]: { label: "开始", color: "#10b981" },
  backlog: { label: "待办", color: "#6b7280" },
  unstarted: { label: "未开始", color: "#3f76ff" },
  started: { label: "进行中", color: "#f59e0b" },
  completed: { label: "已完成", color: "#16a34a" },
  cancelled: { label: "已取消", color: "#dc2626" },
  [UNKNOWN_GROUP]: { label: "其他", color: "#94a3b8" },
};

export type TFlowNodeKind = "start" | "state";

export type TFlowNode = {
  id: string;
  kind: TFlowNodeKind;
  /** start 节点与已删除状态为 null */
  state: TFlowchartState | null;
  label: string;
  color: string;
  /** 同组内的列号 */
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TFlowEdgeDirection = "forward" | "backward" | "same";

export type TFlowEdge = {
  id: string;
  transition: TFlowchartTransition;
  sourceId: string;
  targetId: string;
  direction: TFlowEdgeDirection;
  /** SVG 路径（正交直角折线，带圆角） */
  path: string;
  /** 连线中点（审批徽章定位） */
  labelX: number;
  labelY: number;
};

/** 状态组泳道（渲染层据此画行背景与组名） */
export type TFlowBand = {
  key: string;
  label: string;
  color: string;
  y: number;
  height: number;
};

export type TFlowLayout = {
  nodes: TFlowNode[];
  edges: TFlowEdge[];
  bands: TFlowBand[];
  width: number;
  height: number;
  nodeById: Record<string, TFlowNode>;
};

type TRawEdge = {
  id: string;
  transition: TFlowchartTransition;
  sourceId: string;
  targetId: string;
};

type TPoint = { x: number; y: number };
type TSide = "top" | "bottom" | "left" | "right";

function dist(a: TPoint, b: TPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 从 from 朝 to 方向移动 d 距离的点 */
function towards(from: TPoint, to: TPoint, d: number): TPoint {
  const len = dist(from, to) || 1;
  const t = Math.min(1, d / len);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** 折线 → 带圆角拐角的 SVG path */
function roundedPath(pts: TPoint[], radius = CORNER_RADIUS): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const r1 = Math.min(radius, dist(prev, cur) / 2);
    const r2 = Math.min(radius, dist(cur, next) / 2);
    const entry = towards(cur, prev, r1);
    const exit = towards(cur, next, r2);
    d += ` L ${entry.x} ${entry.y} Q ${cur.x} ${cur.y} ${exit.x} ${exit.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/** 折线中最长一段的中点（让徽章落在清爽的直段上、避开节点） */
function longestSegmentMidpoint(pts: TPoint[]): TPoint {
  let best: TPoint = pts[0] ?? { x: 0, y: 0 };
  let bestLen = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = dist(pts[i], pts[i + 1]);
    if (len > bestLen) {
      bestLen = len;
      best = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
    }
  }
  return best;
}

/**
 * 纯布局：按「状态组」分泳道（每组一行，组内左→右、放不下换行），组间自上而下排列。
 * - 合成「开始」节点承载 from_state_id 为空的初始流转（单独置顶泳道）。
 * - 引用到不在 states 列表里的状态（已删除）归入「其他」组占位，避免丢边或崩溃。
 * - 连线正交走线，并把每条边在节点边沿分散锚点，避免多条线重叠合并。
 */
export function computeFlowLayout(
  states: TFlowchartState[],
  transitions: TFlowchartTransition[],
  availableWidth = 0
): TFlowLayout {
  const nodeById: Record<string, TFlowNode> = {};
  const nodeOrder: string[] = [];
  const groupOf: Record<string, string> = {};

  const ensureStateNode = (state: TFlowchartState) => {
    if (nodeById[state.id]) return;
    nodeById[state.id] = {
      id: state.id,
      kind: "state",
      state,
      label: state.name,
      color: state.color || "#94a3b8",
      column: 0,
      x: 0,
      y: 0,
      width: NODE_W,
      height: NODE_H,
    };
    groupOf[state.id] = state.group || UNKNOWN_GROUP;
    nodeOrder.push(state.id);
  };

  const ensurePlaceholderNode = (id: string) => {
    if (nodeById[id]) return;
    nodeById[id] = {
      id,
      kind: "state",
      state: null,
      label: "已删除状态",
      color: "#94a3b8",
      column: 0,
      x: 0,
      y: 0,
      width: NODE_W,
      height: NODE_H,
    };
    groupOf[id] = UNKNOWN_GROUP;
    nodeOrder.push(id);
  };

  // 1) 状态节点（保持后端返回顺序，即 sequence 顺序）
  states.forEach((state, index) => {
    ensureStateNode(state);
    (nodeById[state.id] as TFlowNode & { _seq?: number })._seq = index;
  });

  // 2) 原始边 + 合成开始节点 / 删除占位
  const rawEdges: TRawEdge[] = [];
  let hasStart = false;
  for (const transition of transitions) {
    let sourceId: string;
    if (transition.from_state_id == null) {
      hasStart = true;
      sourceId = START_NODE_ID;
    } else {
      ensurePlaceholderNode(transition.from_state_id);
      sourceId = transition.from_state_id;
    }

    const targetId = transition.to_state_id ?? `__deleted_to__${transition.id}`;
    if (transition.to_state_id == null) ensurePlaceholderNode(targetId);
    else ensurePlaceholderNode(transition.to_state_id);

    rawEdges.push({ id: transition.id, transition, sourceId, targetId });
  }

  if (hasStart) {
    nodeById[START_NODE_ID] = {
      id: START_NODE_ID,
      kind: "start",
      state: null,
      label: "开始",
      color: "#10b981",
      column: 0,
      x: 0,
      y: 0,
      width: 112,
      height: NODE_H,
    };
    groupOf[START_NODE_ID] = START_GROUP;
    nodeOrder.unshift(START_NODE_ID);
  }

  // 3) 按状态组分桶（仅保留有节点的组，按规范顺序）
  const getSeq = (id: string) => (nodeById[id] as TFlowNode & { _seq?: number })._seq ?? Number.MAX_SAFE_INTEGER;
  const idsByGroup: Record<string, string[]> = {};
  for (const id of nodeOrder) {
    const g = groupOf[id];
    (idsByGroup[g] ??= []).push(id);
  }
  const presentGroups = GROUP_ORDER.filter((g) => idsByGroup[g]?.length);
  for (const g of presentGroups) {
    idsByGroup[g].sort((a, b) => {
      const ka = nodeById[a].kind === "start" ? 0 : 1;
      const kb = nodeById[b].kind === "start" ? 0 : 1;
      if (ka !== kb) return ka - kb;
      const sa = getSeq(a);
      const sb = getSeq(b);
      if (sa !== sb) return sa - sb;
      return nodeById[a].label.localeCompare(nodeById[b].label);
    });
  }

  // 4) 列数（按可用宽度，预留左侧组名 gutter）
  const maxGroupSize = presentGroups.reduce((m, g) => Math.max(m, idsByGroup[g].length), 1);
  const usableWidth = availableWidth > 0 ? availableWidth : FALLBACK_WIDTH;
  let columnsPerRow = Math.floor((usableWidth - LABEL_GUTTER - 2 * PADDING + COL_GAP) / COL_PITCH);
  columnsPerRow = Math.max(1, Math.min(columnsPerRow, maxGroupSize));

  // 5) 泳道定位（每组一行，组内换行向下）
  const bands: TFlowBand[] = [];
  const nodeBand: Record<string, number> = {};
  let curY = PADDING;
  presentGroups.forEach((g, bandIndex) => {
    const ids = idsByGroup[g];
    const subRows = Math.max(1, Math.ceil(ids.length / columnsPerRow));
    const bandHeight = subRows * NODE_H + (subRows - 1) * INTRA_ROW_GAP;
    ids.forEach((id, j) => {
      const sr = Math.floor(j / columnsPerRow);
      const pos = j % columnsPerRow;
      const node = nodeById[id];
      node.column = pos;
      node.x = PADDING + LABEL_GUTTER + pos * COL_PITCH;
      node.y = curY + sr * (NODE_H + INTRA_ROW_GAP);
      nodeBand[id] = bandIndex;
    });
    const meta = GROUP_META[g] ?? { label: g, color: "#94a3b8" };
    bands.push({ key: g, label: meta.label, color: meta.color, y: curY, height: bandHeight });
    curY += bandHeight + BAND_GAP;
  });

  const usedCols = Math.min(columnsPerRow, maxGroupSize);
  const width = PADDING * 2 + LABEL_GUTTER + Math.max(0, usedCols - 1) * COL_PITCH + NODE_W;
  const height = curY - BAND_GAP + PADDING;

  // 6) 连线：分散锚点（避免合并）+ 正交走线
  // 同泳道仅在「同 subRow + 列相邻 + 向右」时左右直连（走列间空隙）；其余同泳道边走上/下通道
  const sameRowAdjacentRight = (sB: number, tB: number, s: TFlowNode, t: TFlowNode): boolean =>
    sB === tB && Math.abs(t.y - s.y) < 1 && Math.abs((t.column ?? 0) - (s.column ?? 0)) === 1 && t.x > s.x;
  const sourceSide = (sB: number, tB: number, s: TFlowNode, t: TFlowNode): TSide => {
    if (tB > sB) return "bottom";
    if (tB < sB) return "top";
    if (Math.abs(t.y - s.y) >= 1) return t.y > s.y ? "bottom" : "top"; // 组内换行：竖向出
    if (sameRowAdjacentRight(sB, tB, s, t)) return "right";
    return t.x > s.x ? "bottom" : "top"; // 向右非相邻走下通道，向左走上通道
  };
  const targetSide = (sB: number, tB: number, s: TFlowNode, t: TFlowNode): TSide => {
    if (tB > sB) return "top";
    if (tB < sB) return "bottom";
    if (Math.abs(t.y - s.y) >= 1) return t.y > s.y ? "top" : "bottom";
    if (sameRowAdjacentRight(sB, tB, s, t)) return "left";
    return t.x > s.x ? "bottom" : "top";
  };

  type TWork = { raw: TRawEdge; sB: number; tB: number; sSide: TSide; tSide: TSide };
  const work: TWork[] = [];
  const srcBuckets = new Map<string, { id: string; key: number }[]>();
  const tgtBuckets = new Map<string, { id: string; key: number }[]>();

  for (const raw of rawEdges) {
    if (raw.sourceId === raw.targetId) {
      work.push({ raw, sB: nodeBand[raw.sourceId] ?? 0, tB: nodeBand[raw.targetId] ?? 0, sSide: "top", tSide: "top" });
      continue;
    }
    const s = nodeById[raw.sourceId];
    const t = nodeById[raw.targetId];
    const sB = nodeBand[raw.sourceId] ?? 0;
    const tB = nodeBand[raw.targetId] ?? 0;
    const sSide = sourceSide(sB, tB, s, t);
    const tSide = targetSide(sB, tB, s, t);
    work.push({ raw, sB, tB, sSide, tSide });

    const horizontal = sSide === "left" || sSide === "right";
    const sKey = `${raw.sourceId}:${sSide}`;
    const tKey = `${raw.targetId}:${tSide}`;
    (srcBuckets.get(sKey) ?? srcBuckets.set(sKey, []).get(sKey)!).push({
      id: raw.id,
      key: horizontal ? t.y + t.height / 2 : t.x + t.width / 2,
    });
    const tHorizontal = tSide === "left" || tSide === "right";
    (tgtBuckets.get(tKey) ?? tgtBuckets.set(tKey, []).get(tKey)!).push({
      id: raw.id,
      key: tHorizontal ? s.y + s.height / 2 : s.x + s.width / 2,
    });
  }

  const anchorFor = (node: TFlowNode, side: TSide, k: number, n: number): TPoint => {
    const frac = (k + 1) / (n + 1);
    switch (side) {
      case "bottom":
        return { x: node.x + node.width * frac, y: node.y + node.height };
      case "top":
        return { x: node.x + node.width * frac, y: node.y };
      case "right":
        return { x: node.x + node.width, y: node.y + node.height * frac };
      case "left":
      default:
        return { x: node.x, y: node.y + node.height * frac };
    }
  };

  const srcAnchorById: Record<string, TPoint> = {};
  const tgtAnchorById: Record<string, TPoint> = {};
  for (const [key, list] of srcBuckets) {
    const nodeId = key.slice(0, key.lastIndexOf(":"));
    const side = key.slice(key.lastIndexOf(":") + 1) as TSide;
    list.sort((a, b) => a.key - b.key);
    list.forEach((item, k) => {
      srcAnchorById[item.id] = anchorFor(nodeById[nodeId], side, k, list.length);
    });
  }
  for (const [key, list] of tgtBuckets) {
    const nodeId = key.slice(0, key.lastIndexOf(":"));
    const side = key.slice(key.lastIndexOf(":") + 1) as TSide;
    list.sort((a, b) => a.key - b.key);
    list.forEach((item, k) => {
      tgtAnchorById[item.id] = anchorFor(nodeById[nodeId], side, k, list.length);
    });
  }

  const channelCounter = new Map<string, number>();
  let maxChannelY = height - PADDING;
  const edges: TFlowEdge[] = work.map(({ raw, sB, tB, sSide }) => {
    const source = nodeById[raw.sourceId];
    const direction: TFlowEdgeDirection = tB > sB ? "forward" : tB < sB ? "backward" : "same";

    let pts: TPoint[];

    if (raw.sourceId === raw.targetId) {
      // 自环：节点上方小回环
      const a = { x: source.x + source.width * 0.62, y: source.y };
      const b = { x: source.x + source.width * 0.38, y: source.y };
      const top = source.y - 42;
      pts = [a, { x: a.x, y: top }, { x: b.x, y: top }, b];
    } else {
      const sa = srcAnchorById[raw.id] ?? { x: source.x + source.width / 2, y: source.y + source.height };
      const ta = tgtAnchorById[raw.id] ?? { x: nodeById[raw.targetId].x + nodeById[raw.targetId].width / 2, y: nodeById[raw.targetId].y };
      const directGap = sSide === "right" || sSide === "left";
      if (directGap) {
        // 同 subRow 相邻：走两节点之间的列空隙直连
        const midX = (sa.x + ta.x) / 2;
        pts = [sa, { x: midX, y: sa.y }, { x: midX, y: ta.y }, ta];
      } else {
        // top/bottom：走泳道上/下边缘外的空白通道（不在节点高度横穿）
        const down = sSide === "bottom";
        const gapKey = `${down ? "d" : "u"}:${sB}`;
        const track = channelCounter.get(gapKey) ?? 0;
        channelCounter.set(gapKey, track + 1);
        const band = bands[sB];
        const gapY = down
          ? band.y + band.height + CHANNEL_OFFSET + track * TRACK_GAP
          : band.y - CHANNEL_OFFSET - track * TRACK_GAP;
        if (gapY > maxChannelY) maxChannelY = gapY;
        pts = [sa, { x: sa.x, y: gapY }, { x: ta.x, y: gapY }, ta];
      }
    }

    const path = roundedPath(pts);
    const mid = longestSegmentMidpoint(pts);

    return {
      id: raw.id,
      transition: raw.transition,
      sourceId: raw.sourceId,
      targetId: raw.targetId,
      direction,
      path,
      labelX: mid.x,
      labelY: mid.y,
    };
  });

  return {
    nodes: nodeOrder.map((id) => nodeById[id]),
    edges,
    bands,
    width,
    height: Math.max(height, maxChannelY + PADDING),
    nodeById,
  };
}
