"use client";

import { useMemo, useState } from "react";
import { CYCLE_STATUS, CYCLE_STATUS_TRANSITIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { PieChart } from "@plane/propel/charts/pie-chart";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ICycle } from "@plane/types";
import { Avatar, CircularProgressIndicator, CustomSelect } from "@plane/ui";
import { getDate, getFileURL, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { TestingDatesConfirmModal } from "@/components/common/testing-dates-confirm-modal";
import { formatCycleUpdateError } from "@/components/cycles/use-cycle-error-message";
import { useCycleStatusChange } from "@/components/cycles/use-cycle-status-change";
import { useCycle } from "@/hooks/store/use-cycle";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { useCycleBasicInfo } from "./use-cycle-basic-info";

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  cycleDetails: ICycle;
  canEdit: boolean;
};

const ISSUE_TYPE_RING_COLORS = ["#1D4ED8", "#2563EB", "#3B82F6", "#60A5FA", "#93C5FD", "#14B8A6", "#8B5CF6"];
const isCssColor = (value?: string): value is string =>
  !!value &&
  (value.startsWith("#") ||
    value.startsWith("rgb") ||
    value.startsWith("hsl") ||
    value.startsWith("var(") ||
    value === "currentColor");

export const CycleBasicInfoCard = ({ workspaceSlug, projectId, cycleId, cycleDetails, canEdit }: Props) => {
  const { t } = useTranslation();
  const { updateCycleDetails } = useCycle();
  const { getUserDetails } = useMember();
  const { data: currentUser } = useUser();
  const [isUpdatingDateRange, setIsUpdatingDateRange] = useState(false);
  const [isUpdatingOwner, setIsUpdatingOwner] = useState(false);
  const { completionRate, delayRate, typeDistribution, isTypeLoading } = useCycleBasicInfo({
    workspaceSlug,
    projectId,
    cycleId,
    cycleDetails,
  });

  const cycleStatus = (cycleDetails?.status ?? "not_started") as NonNullable<ICycle["status"]>;
  const cycleOwner = cycleDetails ? getUserDetails(cycleDetails.owned_by_id) : undefined;
  const statusInfo = CYCLE_STATUS.find((status) => status.value === cycleStatus);
  const statusOptions = CYCLE_STATUS_TRANSITIONS[cycleStatus] ?? [];
  const startDate = getDate(cycleDetails?.start_date);
  const endDate = getDate(cycleDetails?.end_date);
  const durationLabel = `${startDate ? renderFormattedDate(startDate, "yyyy.MM.dd") : "-"} ~ ${
    endDate ? renderFormattedDate(endDate, "yyyy.MM.dd") : "-"
  }`;
  const isCompleted = cycleStatus === "completed";
  const isCurrentOwner = Boolean(currentUser?.id) && String(cycleDetails.owned_by_id) === String(currentUser?.id);
  const canChangeStatus = canEdit && !cycleDetails?.archived_at && statusOptions.length > 0;
  const canUpdateDateRange = canEdit && !cycleDetails?.archived_at && !isCompleted;
  const canUpdateOwner = canEdit && !cycleDetails?.archived_at && isCurrentOwner;
  const { isUpdatingStatus, handleStatusChange, testingDatesModalProps } = useCycleStatusChange({
    workspaceSlug,
    projectId,
    cycleId,
    cycleDetails,
    canChangeStatus,
  });

  const issueTypePieData = useMemo(
    () =>
      typeDistribution.map((item, index) => ({
        key: item.type_id ?? `type-${index}`,
        name: item.name,
        value: item.count,
        fill: isCssColor(item.logo_props?.icon?.color)
          ? item.logo_props.icon.color
          : ISSUE_TYPE_RING_COLORS[index % ISSUE_TYPE_RING_COLORS.length],
      })),
    [typeDistribution]
  );

  const issueTypeCells = useMemo(
    () => issueTypePieData.map((item) => ({ key: item.key, fill: item.fill })),
    [issueTypePieData]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between">
      <TestingDatesConfirmModal {...testingDatesModalProps} />
      <div className="grid grid-cols-3 gap-3 pt-2 pb-5">
        <div className="flex min-w-0 flex-col items-center gap-2">
          <span className="text-center text-sm font-medium leading-5 text-primary">工作项完成率</span>
          <CircularProgressIndicator size={82} percentage={completionRate} strokeWidth={6}>
            <span className="text-sm font-semibold tabular-nums text-primary">{completionRate}%</span>
          </CircularProgressIndicator>
        </div>
        <div className="flex min-w-0 flex-col items-center gap-2">
          <span className="text-center text-sm font-medium leading-5 text-primary">工作项延误率</span>
          <CircularProgressIndicator size={82} percentage={delayRate} strokeWidth={6}>
            <span className="text-sm font-semibold tabular-nums text-primary">{delayRate}%</span>
          </CircularProgressIndicator>
        </div>
        <div className="flex min-w-0 flex-col items-center gap-2">
          <span className="text-center text-sm font-medium leading-5 text-primary">工作项类型</span>
          {isTypeLoading ? (
            <div className="h-[82px] w-[82px] animate-pulse rounded-full border-8 border-subtle" />
          ) : issueTypePieData.length > 0 ? (
            <div className="group relative h-[82px] w-[82px]">
              <PieChart
                className="pointer-events-none size-full"
                data={issueTypePieData}
                dataKey="value"
                cells={issueTypeCells}
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                innerRadius="70%"
                outerRadius="100%"
                paddingAngle={issueTypePieData.length > 1 ? 2 : 0}
                cornerRadius={3}
                showLabel={false}
                showTooltip={false}
              />
              <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 group-hover:block">
                <div className="w-max max-w-[180px] rounded-md border border-subtle bg-surface-1 p-2 shadow-lg">
                  <p className="mb-1 border-b border-subtle pb-1 text-11 font-medium text-primary">工作项类型</p>
                  <div className="flex flex-col gap-1">
                    {issueTypePieData.map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-3 text-11">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="size-2 flex-shrink-0 rounded-xs" style={{ backgroundColor: item.fill }} />
                          <span className="truncate text-tertiary">{item.name}</span>
                        </span>
                        <span className="flex-shrink-0 font-medium text-secondary">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[82px] w-[82px] rounded-full border-8 border-subtle" />
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-2.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 font-semibold text-primary">负责人：</span>
          {canUpdateOwner ? (
            <div className="h-6 min-w-0 max-w-[220px] flex-1 text-left">
              <MemberDropdown
                value={cycleDetails?.owned_by_id ?? null}
                onChange={(nextOwnerId) => {
                  if (!nextOwnerId || isUpdatingOwner || nextOwnerId === cycleDetails.owned_by_id || !canUpdateOwner) return;
                  void (async () => {
                    setIsUpdatingOwner(true);
                    try {
                      await updateCycleDetails(workspaceSlug, projectId, cycleId, { owned_by_id: nextOwnerId });
                      setToast({
                        type: TOAST_TYPE.SUCCESS,
                        title: t("project_cycles.action.update.success.title"),
                        message: t("project_cycles.action.update.success.description"),
                      });
                    } catch (err) {
                      const { title, message } = formatCycleUpdateError(err);
                      setToast({
                        type: TOAST_TYPE.ERROR,
                        title,
                        message,
                      });
                    } finally {
                      setIsUpdatingOwner(false);
                    }
                  })();
                }}
                multiple={false}
                projectId={projectId}
                buttonVariant="transparent-with-text"
                className="h-full w-full"
                buttonContainerClassName="w-full text-left"
                buttonClassName="!px-0 !py-0 text-sm hover:bg-transparent"
                labelClassName="text-secondary"
                placeholder="未指定"
                showUserDetails
                disabled={!canUpdateOwner || isUpdatingOwner}
              />
            </div>
          ) : cycleOwner ? (
            <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-secondary">
              <Avatar size="sm" name={cycleOwner.display_name ?? ""} src={getFileURL(cycleOwner.avatar_url ?? "")} />
              <span className="truncate">{cycleOwner.display_name}</span>
            </span>
          ) : (
            <span className="flex-1 text-secondary">未指定</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 font-semibold text-primary">迭代状态：</span>
          {statusInfo && canChangeStatus ? (
            <CustomSelect
              className="min-w-0 flex-1"
              customButtonClassName="w-full justify-start"
              customButton={
                <span
                  className="inline-flex cursor-pointer items-center rounded-md px-2.5 py-1 text-sm font-medium"
                  style={{ color: statusInfo.color, backgroundColor: `${statusInfo.color}20` }}
                >
                  {t(statusInfo.i18n_title)}
                </span>
              }
              value={cycleStatus}
              onChange={(nextStatus: string) => {
                handleStatusChange(nextStatus);
              }}
              disabled={!canChangeStatus || isUpdatingStatus}
            >
              {CYCLE_STATUS.filter((status) => statusOptions.includes(status.value)).map((status) => (
                <CustomSelect.Option key={status.value} value={status.value}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                    {t(status.i18n_title)}
                  </div>
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          ) : statusInfo ? (
            <span
              className="inline-flex min-w-0 flex-1 items-center rounded-md px-2.5 py-1 text-sm font-medium"
              style={{ color: statusInfo.color, backgroundColor: `${statusInfo.color}20` }}
            >
              {t(statusInfo.i18n_title)}
            </span>
          ) : (
            <span className="flex-1 text-secondary">-</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 font-semibold text-primary">持续时间：</span>
          {canUpdateDateRange ? (
            <div className="h-6 min-w-0 max-w-[260px] flex-1 text-left">
              <DateRangeDropdown
                buttonVariant="transparent-with-text"
                className="h-full w-full"
                buttonContainerClassName="w-full text-left"
                buttonClassName="!px-0 !py-0 text-left text-sm tabular-nums text-secondary hover:bg-transparent"
                value={{
                  from: startDate,
                  to: endDate,
                }}
                onSelect={(val) => {
                  if (!val?.from || !val?.to || isUpdatingDateRange || !canUpdateDateRange) return;
                  const nextStartDate = renderFormattedPayloadDate(val.from) ?? null;
                  const nextEndDate = renderFormattedPayloadDate(val.to) ?? null;
                  const currentStartDate = cycleDetails.start_date ?? null;
                  const currentEndDate = cycleDetails.end_date ?? null;
                  if (nextStartDate === currentStartDate && nextEndDate === currentEndDate) return;

                  void (async () => {
                    setIsUpdatingDateRange(true);
                    try {
                      await updateCycleDetails(workspaceSlug, projectId, cycleId, {
                        start_date: nextStartDate,
                        end_date: nextEndDate,
                      });
                      setToast({
                        type: TOAST_TYPE.SUCCESS,
                        title: t("project_cycles.action.update.success.title"),
                        message: t("project_cycles.action.update.success.description"),
                      });
                    } catch (err) {
                      const { title, message } = formatCycleUpdateError(err);
                      setToast({
                        type: TOAST_TYPE.ERROR,
                        title,
                        message,
                      });
                    } finally {
                      setIsUpdatingDateRange(false);
                    }
                  })();
                }}
                placeholder={{
                  from: "-",
                  to: "-",
                }}
                mergeDates
                hideIcon={{
                  from: true,
                  to: true,
                }}
                disabled={!canUpdateDateRange || isUpdatingDateRange}
              />
            </div>
          ) : (
            <span className="tabular-nums text-secondary flex-1">{durationLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
};
