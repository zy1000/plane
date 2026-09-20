"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { Repeat, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { CycleService } from "@/services/cycle.service";
import { ReleaseService } from "@/services/release.service";
import { CaseService } from "@/services/qa/case.service";
import { PlanService } from "@/services/qa/plan.service";
import { qaCaseSetToastError, qaCaseSetToastSuccess, qaCaseSetToastWarning } from "@/utils/qa-case-error";
import { useTranslation } from "@plane/i18n";
import type { ICycle, IRelease } from "@plane/types";

export type TPlanPlanningTab = "cycle" | "release";

type Props = {
  isOpen: boolean;
  initialTab?: TPlanPlanningTab;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  planId?: string;
  onClosed?: () => void;
};

type TRow = {
  id: string;
  name: string;
  statusLabel: string;
  statusClass: string;
  ownerId: string | null;
  startDate: string | null;
  endDate: string | null;
  /** 仅迭代有进度 */
  percent?: number;
};

const TAG_CLASS = "inline-flex h-[22px] items-center rounded px-2 text-12 font-medium whitespace-nowrap";
const STATUS_CLASS: Record<string, string> = {
  未开始: "bg-layer-3 text-secondary",
  进行中: "bg-accent-subtle text-accent-primary",
  已完成: "bg-success-subtle text-success-primary",
  已规划: "bg-accent-subtle text-accent-primary",
  已暂停: "bg-warning-subtle text-warning-primary",
  已取消: "bg-danger-subtle text-danger-primary",
};

const RELEASE_STATUS_LABEL: Record<string, string> = {
  backlog: "未开始",
  planned: "已规划",
  "in-progress": "进行中",
  paused: "已暂停",
  completed: "已完成",
  cancelled: "已取消",
};

const getCycleStatusLabel = (startDate?: string | null, endDate?: string | null) => {
  if (!startDate || !endDate) return "未开始";
  const now = dayjs();
  if (now.isBefore(dayjs(startDate))) return "未开始";
  if (now.isAfter(dayjs(endDate))) return "已完成";
  return "进行中";
};

const formatDate = (value?: string | null) => (value ? dayjs(value).format("MM-DD") : "");

/** 通过迭代 / 发布规划用例：两个来源合并为一个弹窗，顶部切换 */
export const PlanPlanningModal = ({
  isOpen,
  initialTab = "cycle",
  onClose,
  onClosed,
  workspaceSlug,
  projectId,
  planId,
}: Props) => {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);
  const cycleService = useRef(new CycleService()).current;
  const releaseService = useRef(new ReleaseService()).current;
  const caseService = useRef(new CaseService()).current;
  const planService = useRef(new PlanService()).current;

  const [tab, setTab] = useState<TPlanPlanningTab>(initialTab);
  const [cycles, setCycles] = useState<ICycle[]>([]);
  const [releases, setReleases] = useState<IRelease[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCycleIds, setSelectedCycleIds] = useState<string[]>([]);
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    setSelectedCycleIds([]);
    setSelectedReleaseIds([]);
    if (!workspaceSlug || !projectId) return;

    setLoading(true);
    Promise.allSettled([
      cycleService.getCyclesWithParams(workspaceSlug, projectId, "all" as any),
      releaseService.getReleases(workspaceSlug, projectId),
    ])
      .then(([cycleResult, releaseResult]) => {
        setCycles(cycleResult.status === "fulfilled" && Array.isArray(cycleResult.value) ? cycleResult.value : []);
        setReleases(
          releaseResult.status === "fulfilled" && Array.isArray(releaseResult.value) ? releaseResult.value : []
        );
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceSlug, projectId, initialTab]);

  const cycleRows: TRow[] = useMemo(
    () =>
      (cycles || []).map((cycle: any) => {
        const total = cycle.total_issues || 0;
        const completed = cycle.completed_issues || 0;
        const statusLabel = getCycleStatusLabel(cycle.start_date, cycle.end_date);
        return {
          id: String(cycle.id),
          name: String(cycle.name || "-"),
          statusLabel,
          statusClass: STATUS_CLASS[statusLabel] ?? STATUS_CLASS["未开始"],
          ownerId: cycle.owned_by_id ? String(cycle.owned_by_id) : null,
          startDate: cycle.start_date ?? null,
          endDate: cycle.end_date ?? null,
          percent: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      }),
    [cycles]
  );

  const releaseRows: TRow[] = useMemo(
    () =>
      (releases || []).map((release: any) => {
        const statusLabel = RELEASE_STATUS_LABEL[String(release.status ?? "")] ?? String(release.status ?? "-");
        return {
          id: String(release.id),
          name: String(release.name || "-"),
          statusLabel,
          statusClass: STATUS_CLASS[statusLabel] ?? STATUS_CLASS["未开始"],
          ownerId: release.lead_id ? String(release.lead_id) : null,
          startDate: release.start_date ?? null,
          endDate: release.target_date ?? null,
        };
      }),
    [releases]
  );

  const isCycleTab = tab === "cycle";
  const rows = isCycleTab ? cycleRows : releaseRows;
  const selectedIds = isCycleTab ? selectedCycleIds : selectedReleaseIds;
  const setSelectedIds = isCycleTab ? setSelectedCycleIds : setSelectedReleaseIds;
  const unitLabel = isCycleTab ? "迭代" : "发布";

  const gridTemplateColumns = isCycleTab
    ? "36px minmax(0,1fr) 92px 120px 132px 150px"
    : "36px minmax(0,1fr) 92px 132px 150px";

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const isIndeterminate = selectedIds.length > 0 && !allSelected;

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((item) => item !== id)));
  };

  const handleClose = () => {
    onClose();
    onClosed?.();
  };

  const handleConfirm = async () => {
    if (selectedIds.length === 0) {
      qaCaseSetToastWarning(`请至少选择一个${unitLabel}`);
      return;
    }
    if (!planId) {
      qaCaseSetToastWarning("缺少测试计划 ID");
      return;
    }

    try {
      setSubmitting(true);
      if (isCycleTab) {
        await caseService.assocateCycle(workspaceSlug, { plan_id: String(planId), cycle_id: selectedIds });
      } else {
        await planService.associateReleases(workspaceSlug, projectId, {
          plan_id: String(planId),
          release_ids: selectedIds,
        });
      }
      qaCaseSetToastSuccess("用例已加入计划");
      handleClose();
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "关联失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXXL}
      className="rounded-2xl sm:max-w-[52rem]"
      initialFocus={bodyRef}
    >
      <div className="flex max-h-[min(86vh,50rem)] min-h-0 w-full flex-col text-primary">
        {/* Header */}
        <div className="flex items-start gap-3.5 px-6 pt-5 pb-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-accent-subtle bg-accent-subtle text-accent-primary">
            <Repeat className="size-[18px]" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base leading-tight font-semibold text-primary">按{unitLabel}规划</h3>
            <p className="mt-1 text-13 leading-snug text-tertiary">
              勾选{unitLabel}后，其关联需求下的用例会加入计划，已在计划中的自动跳过
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="关闭"
            className="-mt-0.5 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div
          ref={bodyRef}
          tabIndex={-1}
          className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto border-t border-subtle px-6 pt-5 pb-1 outline-none"
        >
          <div className="inline-flex w-fit gap-0.5 rounded-lg border border-subtle bg-layer-1 p-0.5">
            {(
              [
                { key: "cycle" as const, label: "迭代", count: cycleRows.length },
                { key: "release" as const, label: "发布", count: releaseRows.length },
              ]
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-3.5 text-13 transition-colors",
                  tab === item.key ? "bg-surface-1 font-medium text-primary shadow-raised-100" : "text-secondary"
                )}
              >
                {item.label}
                <span className="rounded bg-layer-3 px-1.5 text-11 text-tertiary tabular-nums">{item.count}</span>
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-subtle">
            <div
              className="grid h-9 items-center border-b border-subtle bg-layer-1 pr-3 text-12 text-tertiary"
              style={{ gridTemplateColumns }}
            >
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={allSelected}
                  indeterminate={isIndeterminate}
                  disabled={rows.length === 0}
                  onChange={(event) => setSelectedIds(event.target.checked ? rows.map((row) => row.id) : [])}
                />
              </div>
              <div className="min-w-0 px-2">名称</div>
              <div className="px-2">状态</div>
              {isCycleTab && <div className="px-2">进度</div>}
              <div className="px-2">负责人</div>
              <div className="px-2">周期</div>
            </div>

            {loading ? (
              <div className="flex h-40 items-center justify-center text-13 text-secondary">加载中...</div>
            ) : rows.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-13 text-placeholder">暂无{unitLabel}</div>
            ) : (
              rows.map((row) => {
                const checked = selectedIds.includes(row.id);
                return (
                  <div
                    key={row.id}
                    className={cn(
                      "grid h-[52px] cursor-pointer items-center border-b border-subtle pr-3 text-13 transition-colors last:border-b-0",
                      checked ? "bg-accent-subtle" : "hover:bg-layer-1"
                    )}
                    style={{ gridTemplateColumns }}
                    onClick={() => toggleRow(row.id, !checked)}
                    role="presentation"
                  >
                    <div className="flex items-center justify-center" onClick={(event) => event.stopPropagation()} role="presentation">
                      <Checkbox checked={checked} onChange={(event) => toggleRow(row.id, event.target.checked)} />
                    </div>
                    <div className="min-w-0 truncate px-2 font-medium text-primary" title={row.name}>
                      {row.name}
                    </div>
                    <div className="px-2">
                      <span className={`${TAG_CLASS} ${row.statusClass}`}>{row.statusLabel}</span>
                    </div>
                    {isCycleTab && (
                      <div className="flex items-center gap-2 px-2 text-12 text-secondary tabular-nums">
                        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-layer-3">
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              (row.percent ?? 0) >= 100 ? "bg-success-primary" : "bg-accent-primary"
                            )}
                            style={{ width: `${Math.min(100, Math.max(0, row.percent ?? 0))}%` }}
                          />
                        </span>
                        {row.percent ?? 0}%
                      </div>
                    )}
                    <div className="min-w-0 px-2" onClick={(event) => event.stopPropagation()} role="presentation">
                      <MemberDropdown
                        multiple={false}
                        value={row.ownerId}
                        onChange={() => {}}
                        disabled
                        projectId={projectId}
                        placeholder="未指定"
                        className="w-full text-13"
                        buttonContainerClassName="w-full text-left p-0 cursor-default"
                        buttonVariant="transparent-with-text"
                        buttonClassName="text-13 p-0 hover:bg-transparent hover:bg-inherit"
                        showUserDetails
                        optionsClassName="z-[60]"
                      />
                    </div>
                    <div className="px-2 text-12 text-secondary tabular-nums">
                      {row.startDate || row.endDate ? `${formatDate(row.startDate)} → ${formatDate(row.endDate)}` : ""}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2.5 px-6 pt-4 pb-5">
          <span className="mr-auto text-13 text-secondary tabular-nums">
            已选 {selectedIds.length} 个{unitLabel}
          </span>
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={selectedIds.length === 0}
            onClick={handleConfirm}
          >
            加入计划
            {selectedIds.length > 0 && (
              <span className="ml-0.5 rounded bg-white/20 px-1.5 py-px text-xs font-semibold tabular-nums">
                {selectedIds.length}
              </span>
            )}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};

export default PlanPlanningModal;
