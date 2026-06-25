/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useMemo } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileText,
  Layers,
  PlayCircle,
  Repeat,
  ScrollText,
  SquareUser,
  XCircle,
} from "lucide-react";
import { Button } from "@plane/propel/button";
import type { IRelease } from "@plane/types";
import { renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { RichTextEditor } from "@/components/editor/rich-text";
import { buildReleaseActivityFeedItems, ReleaseActivityFeed } from "@/components/releases/release-activity";
import { useReleaseActivity } from "@/hooks/store/use-release-activity";
import { useReleaseComment } from "@/hooks/store/use-release-comment";
import { ReleaseStatusDropdown, type TReleaseUpdatePayload } from "../release-status-dropdown";
import type { ReleaseDetailTabKey } from "./release-page-tabs";

type Plan = {
  id?: string;
  pass_rate?: Record<string, number> | null;
};

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  releaseId: string;
  releaseDetails: IRelease;
  isStatusDisabled: boolean;
  totalIssues: number;
  backlogIssues: number;
  inProgressIssues: number;
  completedIssues: number;
  cancelledIssues: number;
  progress: number;
  daysLeft: number | undefined;
  cyclesCount: number;
  plansCount: number;
  filesCount: number;
  plans: Plan[];
  overdueTotal: number;
  noteHtml: string | null | undefined;
  onReleaseDetailsChange: (payload: TReleaseUpdatePayload) => Promise<void>;
  onJumpTab: (tab: ReleaseDetailTabKey) => void;
  onEditNote: () => void;
};

const STATE_KEY_COLORS: Record<string, string> = {
  backlog: "#64748b",
  inProgress: "#f59e0b",
  completed: "#16a34a",
  cancelled: "#ef4444",
};

const SECTION_CARD =
  "rounded-xl border border-subtle bg-surface-1 transition-shadow hover:shadow-sm";
const KEY_FIELD_CLASS = "h-7 w-[148px]";
const KEY_FIELD_BUTTON_CLASS = "w-full justify-start px-2";
const KEY_FIELD_LABEL_CLASS = "text-xs font-medium";
const KEY_FIELD_VALUE_CLASS = "flex h-7 w-[148px] shrink-0 items-center justify-start";
const EMPTY_RICH_TEXT_HTML = "<p></p>";
const MEDIA_CONTENT_REGEX =
  /<(img|image-component|video|iframe|embed|object|svg|audio)\b|data-type=["'](image|imageComponent|video)["']/i;

const isEmptyReleaseRichText = (html?: string | null): boolean => {
  if (!html) return true;
  const trimmed = html.trim();
  if (!trimmed) return true;
  if (MEDIA_CONTENT_REGEX.test(trimmed)) return false;
  const text = trimmed
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return text.length === 0;
};

export const ReleaseOverviewTab: React.FC<Props> = observer(({
  workspaceSlug,
  workspaceId,
  projectId,
  releaseId,
  releaseDetails,
  isStatusDisabled,
  totalIssues,
  backlogIssues,
  inProgressIssues,
  completedIssues,
  cancelledIssues,
  progress,
  daysLeft,
  cyclesCount,
  plansCount,
  filesCount,
  plans,
  overdueTotal,
  noteHtml,
  onReleaseDetailsChange,
  onJumpTab,
  onEditNote,
}) => {
  const { getActivitiesByReleaseId } = useReleaseActivity();
  const allActivities = getActivitiesByReleaseId(releaseId);
  const { getCommentsByReleaseId, fetchComments } = useReleaseComment();
  const comments = getCommentsByReleaseId(releaseId);

  useSWR(
    workspaceSlug && projectId && releaseId
      ? ["release-comments-for-overview-tab", workspaceSlug, projectId, releaseId]
      : null,
    () => fetchComments(workspaceSlug, projectId, releaseId)
  );

  const feedItems = useMemo(
    () => buildReleaseActivityFeedItems(allActivities, comments),
    [allActivities, comments]
  );

  const distribution = useMemo(() => {
    const denom = totalIssues > 0 ? totalIssues : 1;
    return [
      { key: "completed", label: "已完成", count: completedIssues, color: STATE_KEY_COLORS.completed },
      { key: "inProgress", label: "进行中", count: inProgressIssues, color: STATE_KEY_COLORS.inProgress },
      { key: "backlog", label: "未开始", count: backlogIssues, color: STATE_KEY_COLORS.backlog },
      { key: "cancelled", label: "已取消", count: cancelledIssues, color: STATE_KEY_COLORS.cancelled },
    ].map((seg) => ({ ...seg, pct: (seg.count / denom) * 100 }));
  }, [backlogIssues, cancelledIssues, completedIssues, inProgressIssues, totalIssues]);

  const passRateAggregate = useMemo(() => {
    const acc = { 成功: 0, 失败: 0, 阻塞: 0, 无效: 0, 未执行: 0 } as Record<string, number>;
    let plansWithRate = 0;
    for (const p of plans) {
      if (!p?.pass_rate) continue;
      plansWithRate += 1;
      for (const k of Object.keys(acc)) {
        acc[k] += Number((p.pass_rate as Record<string, number>)[k] || 0);
      }
    }
    const total = Object.values(acc).reduce((s, n) => s + n, 0);
    const passed = acc["成功"];
    const passPct = total > 0 ? Math.floor((passed / total) * 100) : 0;
    return { acc, total, passed, passPct, plansWithRate };
  }, [plans]);

  const normalizedNoteHtml = useMemo(
    () => (noteHtml && noteHtml.trim() ? noteHtml : EMPTY_RICH_TEXT_HTML),
    [noteHtml]
  );
  const hasNoteContent = useMemo(() => !isEmptyReleaseRichText(noteHtml), [noteHtml]);

  const hasRisk = overdueTotal > 0 || passRateAggregate.acc["阻塞"] > 0 || passRateAggregate.acc["失败"] > 0;

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Health summary (occupies 8 cols on xl) */}
        <div className={`${SECTION_CARD} xl:col-span-8 p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent-primary" aria-hidden />
              <h2 className="text-sm font-semibold text-primary">发布健康度</h2>
            </div>
            <ReleaseStatusDropdown
              isDisabled={isStatusDisabled}
              releaseDetails={releaseDetails}
              handleReleaseDetailsChange={onReleaseDetailsChange}
            />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            <HealthMetric
              icon={<Layers className="h-4 w-4 text-accent-primary" aria-hidden />}
              label="工作项"
              value={totalIssues}
            />
            <HealthMetric
              icon={<PlayCircle className="h-4 w-4 text-[#f59e0b]" aria-hidden />}
              label="进行中"
              value={inProgressIssues}
            />
            <HealthMetric
              icon={<CheckCircle2 className="h-4 w-4 text-success-primary" aria-hidden />}
              label="已完成"
              value={completedIssues}
            />
            <HealthMetric
              icon={<XCircle className="h-4 w-4 text-danger-primary" aria-hidden />}
              label="已取消"
              value={cancelledIssues}
            />
          </div>

          <div className="mt-20">
            <div className="mb-2 flex items-center justify-between text-xs text-placeholder">
              <span>工作项状态分布</span>
              <span className="tabular-nums text-secondary">完成度 {progress}%</span>
            </div>
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-layer-2"
              role="img"
              aria-label={`完成 ${completedIssues} / 进行中 ${inProgressIssues} / 未开始 ${backlogIssues} / 已取消 ${cancelledIssues}`}
            >
              {distribution.map((seg) =>
                seg.count === 0 ? null : (
                  <div
                    key={seg.key}
                    style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
                    className="h-full"
                  />
                )
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-secondary">
              {distribution.map((seg) => (
                <span key={seg.key} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span>{seg.label}</span>
                  <span className="tabular-nums text-placeholder">{seg.count}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Key facts (4 cols) */}
        <aside className={`${SECTION_CARD} xl:col-span-4 flex flex-col p-5`}>
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-placeholder" aria-hidden />
            <h2 className="text-sm font-semibold text-primary">关键信息</h2>
          </div>
          <dl className="mt-4 space-y-3">
            <KeyFact
              label="负责人"
              value={
                <MemberDropdown
                  value={releaseDetails.lead_id ?? null}
                  onChange={(val) => {
                    if (val === releaseDetails.lead_id) return;
                    void onReleaseDetailsChange({ lead_id: val });
                  }}
                  projectId={projectId}
                  multiple={false}
                  buttonVariant="transparent-with-text"
                  buttonContainerClassName={KEY_FIELD_CLASS}
                  buttonClassName={KEY_FIELD_BUTTON_CLASS}
                  labelClassName={KEY_FIELD_LABEL_CLASS}
                  disabled={isStatusDisabled}
                  placeholder="选择负责人"
                  icon={SquareUser}
                  placement="bottom-end"
                />
              }
            />
            <KeyFact
              label="开始日期"
              value={
                <DateDropdown
                  value={releaseDetails.start_date}
                  onChange={(val) => {
                    void onReleaseDetailsChange({
                      start_date: val ? renderFormattedPayloadDate(val) : null,
                    });
                  }}
                  buttonVariant="transparent-with-text"
                  className={KEY_FIELD_CLASS}
                  buttonContainerClassName="w-full"
                  buttonClassName={KEY_FIELD_BUTTON_CLASS}
                  labelClassName={KEY_FIELD_LABEL_CLASS}
                  placeholder="选择开始日期"
                  disabled={isStatusDisabled}
                  hideIcon
                  isClearable={false}
                  placement="bottom-end"
                  showTooltip
                />
              }
            />
            <KeyFact
              label="结束日期"
              value={
                <DateDropdown
                  value={releaseDetails.target_date}
                  onChange={(val) => {
                    void onReleaseDetailsChange({
                      target_date: val ? renderFormattedPayloadDate(val) : null,
                    });
                  }}
                  buttonVariant="transparent-with-text"
                  className={KEY_FIELD_CLASS}
                  buttonContainerClassName="w-full"
                  buttonClassName={KEY_FIELD_BUTTON_CLASS}
                  labelClassName={KEY_FIELD_LABEL_CLASS}
                  placeholder="选择结束日期"
                  disabled={isStatusDisabled}
                  hideIcon
                  isClearable={false}
                  placement="bottom-end"
                  showTooltip
                />
              }
            />
            <KeyFact
              label="转测日期"
              value={
                <DateDropdown
                  value={releaseDetails.test_handoff_date}
                  onChange={(val) => {
                    void onReleaseDetailsChange({
                      test_handoff_date: val ? renderFormattedPayloadDate(val) : null,
                    });
                  }}
                  buttonVariant="transparent-with-text"
                  className={KEY_FIELD_CLASS}
                  buttonContainerClassName="w-full"
                  buttonClassName={KEY_FIELD_BUTTON_CLASS}
                  labelClassName={KEY_FIELD_LABEL_CLASS}
                  placeholder="选择转测日期"
                  disabled={isStatusDisabled}
                  hideIcon
                  isClearable={false}
                  placement="bottom-end"
                  showTooltip
                />
              }
            />
            <KeyFact
              label="距离发布"
              value={
                typeof daysLeft === "number" ? (
                  <span className={`pl-2 ${KEY_FIELD_LABEL_CLASS} tabular-nums text-primary`}>
                    {daysLeft}
                    <span className="font-normal text-placeholder"> 天</span>
                  </span>
                ) : (
                  <span className={`pl-2 ${KEY_FIELD_LABEL_CLASS} text-placeholder`}>-</span>
                )
              }
            />
            <KeyFact
              label="活跃风险"
              value={
                hasRisk ? (
                  <span className={`inline-flex items-center gap-1 pl-2 ${KEY_FIELD_LABEL_CLASS} text-danger-primary`}>
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    需关注
                  </span>
                ) : (
                  <span className={`pl-2 ${KEY_FIELD_LABEL_CLASS} text-success-primary`}>无</span>
                )
              }
            />
          </dl>
        </aside>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SummaryCard
          title="关联资源"
          actionLabel="查看关联资源"
          onAction={() => onJumpTab("materials")}
          metrics={[
            {
              icon: <Layers className="h-4 w-4 text-accent-primary" aria-hidden />,
              label: "工作项",
              value: totalIssues,
            },
            {
              icon: <Repeat className="h-4 w-4 text-[#1677ff]" aria-hidden />,
              label: "关联迭代",
              value: cyclesCount,
            },
            {
              icon: <ClipboardList className="h-4 w-4 text-[#6366f1]" aria-hidden />,
              label: "测试计划",
              value: plansCount,
            },
            {
              icon: <FileText className="h-4 w-4 text-placeholder" aria-hidden />,
              label: "附件",
              value: filesCount,
            },
          ]}
        />

        <SummaryCard
          title="质量监控"
          actionLabel="查看质量与风险"
          onAction={() => onJumpTab("quality")}
          metrics={[
            {
              icon: <CheckCircle2 className="h-4 w-4 text-success-primary" aria-hidden />,
              label: "测试通过率",
              value: passRateAggregate.total > 0 ? `${passRateAggregate.passPct}%` : "-",
            },
            {
              icon: <ClipboardList className="h-4 w-4 text-placeholder" aria-hidden />,
              label: "执行用例",
              value: passRateAggregate.total,
            },
            {
              icon: <AlertTriangle className="h-4 w-4 text-[#f59e0b]" aria-hidden />,
              label: "阻塞/失败",
              value: passRateAggregate.acc["阻塞"] + passRateAggregate.acc["失败"],
            },
            {
              icon: <AlertTriangle className="h-4 w-4 text-danger-primary" aria-hidden />,
              label: "延期负责人",
              value: overdueTotal,
            },
          ]}
          tone={hasRisk ? "warning" : "default"}
        />
      </div>

      <div className={`${SECTION_CARD} flex h-[min(56vh,34rem)] min-h-[20rem] flex-col p-5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-placeholder" aria-hidden />
            <h2 className="text-sm font-semibold text-primary">发布说明</h2>
          </div>
          <Button variant="link-neutral" className="text-xs" onClick={onEditNote}>
            编辑
          </Button>
        </div>
        {hasNoteContent ? (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
            <RichTextEditor
              id={`release-note-preview-${releaseId}`}
              editable={false}
              initialValue={normalizedNoteHtml}
              value={normalizedNoteHtml}
              onChange={() => {}}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              projectId={projectId}
              containerClassName="!h-full !pb-0 !pl-0 text-sm leading-relaxed text-secondary"
            />
          </div>
        ) : (
          <div className="mt-3 grid min-h-0 flex-1 place-items-center text-sm text-placeholder">
            暂无发布日志，点击右上角编辑添加。
          </div>
        )}
      </div>

      <div className={`${SECTION_CARD} flex flex-1 flex-col p-5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-placeholder" aria-hidden />
            <h2 className="text-sm font-semibold text-primary">最近动态</h2>
          </div>
          <Button
            variant="link-neutral"
            className="text-xs"
            onClick={() => onJumpTab("activity")}
            aria-label="查看全部动态与评论"
          >
            查看全部
            <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
          </Button>
        </div>
        <div className="mt-2 min-h-0 flex-1">
          <ReleaseActivityFeed
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            releaseId={releaseId}
            activities={feedItems}
            limit={5}
            emptyHint="暂无动态"
          />
        </div>
      </div>
    </div>
  );
});

const HealthMetric: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({
  icon,
  label,
  value,
}) => (
  <div className="flex items-start gap-2.5">
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-layer-2">{icon}</div>
    <div className="min-w-0">
      <div className="text-xs text-placeholder">{label}</div>
      <div className="text-lg font-semibold leading-tight tabular-nums text-primary">{value}</div>
    </div>
  </div>
);

const KeyFact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between border-b border-dashed border-subtle pb-2 last:border-b-0 last:pb-0">
    <dt className="text-xs text-placeholder">{label}</dt>
    <dd className={KEY_FIELD_VALUE_CLASS}>{value}</dd>
  </div>
);

type Metric = {
  icon: React.ReactNode;
  label: string;
  value: number | string;
};

const SummaryCard: React.FC<{
  title: string;
  actionLabel: string;
  onAction: () => void;
  metrics: Metric[];
  tone?: "default" | "warning";
}> = ({ title, actionLabel, onAction, metrics, tone = "default" }) => (
  <div
    className={`${SECTION_CARD} group cursor-pointer p-5 transition-colors hover:border-accent-primary/40`}
    onClick={onAction}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onAction();
      }
    }}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-primary">{title}</h3>
          {tone === "warning" && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#f59e0b]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#f59e0b]">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              关注
            </span>
          )}
        </div>
      </div>
      <span className="inline-flex items-center gap-1 text-xs text-accent-primary opacity-0 transition-opacity group-hover:opacity-100">
        {actionLabel}
        <ArrowRight className="h-3 w-3" aria-hidden />
      </span>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3">
      {metrics.map((m) => (
        <div key={m.label} className="flex items-center gap-2.5 rounded-md px-3 py-2.5">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-1">{m.icon}</div>
          <div className="min-w-0">
            <div className="text-[11px] text-placeholder">{m.label}</div>
            <div className="text-base font-semibold leading-tight tabular-nums text-primary">{m.value}</div>
          </div>
        </div>
      ))}
    </div>
  </div>
);
