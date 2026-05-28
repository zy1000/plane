/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import { Tooltip } from "antd";
import { CYCLE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { normalizeCycleStatus } from "./release-format";

const PASS_RATE_KEYS = ["成功", "失败", "阻塞", "无效", "未执行"] as const;
const PASS_RATE_COLORS: Record<string, string> = {
  成功: "#52c41a",
  失败: "#ff4d4f",
  阻塞: "#faad14",
  无效: "#3b5999",
  未执行: "#bfbfbf",
};

export const PlanStateTag: React.FC<{ state: string | null | undefined }> = ({ state }) => {
  const text = state ? String(state) : "-";
  const classByState: Record<string, string> = {
    未开始: "text-secondary",
    进行中: "text-[#1677ff]",
    已完成: "text-success-primary",
  };
  return (
    <span className={`text-sm font-medium leading-none ${classByState[text] ?? "text-secondary"}`}>
      {text}
    </span>
  );
};

export const PlanPassRate: React.FC<{ passRate: Record<string, number> | null | undefined }> = ({ passRate }) => {
  if (!passRate) return <span className="text-sm text-secondary">-</span>;

  const totalCount = PASS_RATE_KEYS.reduce((s, k) => s + Number(passRate[k] || 0), 0);
  const passed = Number(passRate["成功"] || 0);
  const percent = totalCount > 0 ? Math.floor((passed / totalCount) * 100) : 0;

  const segments = PASS_RATE_KEYS.map((k) => {
    const count = Number(passRate[k] || 0);
    const widthPct = totalCount > 0 ? (count / totalCount) * 100 : 0;
    return { key: k, count, color: PASS_RATE_COLORS[k] ?? "#d9d9d9", widthPct };
  });

  const tooltipContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {PASS_RATE_KEYS.map((k) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "2px",
              backgroundColor: PASS_RATE_COLORS[k] ?? "#d9d9d9",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: "12px", color: "var(--text-color-primary)" }}>{k}</span>
          <span style={{ marginLeft: "auto", fontSize: "12px", color: "#8c8c8c" }}>{Number(passRate[k] || 0)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Tooltip mouseEnterDelay={0.25} title={tooltipContent} color="#fff" overlayInnerStyle={{ color: "#333" }}>
      <div className="flex max-w-[76px] items-center gap-1">
        <div className="min-w-0 flex-1" style={{ maxWidth: "48px" }}>
          <div
            style={{
              width: "100%",
              height: "5px",
              border: "1px solid #e8e8e8",
              borderRadius: "5px",
              overflow: "hidden",
              display: "flex",
            }}
          >
            {segments.map((seg, idx) => (
              <div
                key={`${seg.key}-${idx}`}
                style={{ width: `${seg.widthPct}%`, backgroundColor: seg.color, height: "100%" }}
              />
            ))}
          </div>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-primary">{percent}%</span>
      </div>
    </Tooltip>
  );
};

type CycleLike = {
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export const CycleStatusTag: React.FC<{ cycle: CycleLike }> = ({ cycle }) => {
  const { t } = useTranslation();
  const normalized = normalizeCycleStatus(cycle.status, cycle.start_date, cycle.end_date);
  const info = CYCLE_STATUS.find((s) => s.value === normalized);
  if (!info) return <span className="text-sm text-secondary">-</span>;
  return (
    <span className="text-sm font-medium leading-none" style={{ color: info.color }}>
      {t(info.i18n_title)}
    </span>
  );
};
