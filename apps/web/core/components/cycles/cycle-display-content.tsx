"use client";

import { useState } from "react";
import { isEmpty } from "lodash-es";
import { observer } from "mobx-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardList,
  FileText,
  Info,
  LayoutList,
  LineChart,
  Maximize2,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { BarChart } from "@plane/propel/charts/bar-chart";
import type { ICycle, TProgressSnapshot } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { Loader, Button } from "@plane/ui";
import { getDate, toFilterArray } from "@plane/utils";
import { CycleActivityTab } from "@/components/cycles/cycle-activity-tab";
import { CycleDescriptionFullscreenModal } from "@/components/cycles/cycle-description-fullscreen-modal";
import { CycleAssigneeStatsTable } from "@/components/cycles/cycle-overview/cycle-assignee-stats-table";
import { CycleBasicInfoCard } from "@/components/cycles/cycle-overview/cycle-basic-info-card";
import { CycleSuggestedTestScope } from "@/components/cycles/cycle-overview/cycle-suggested-test-scope";
import { CyclePlanAssociateModal } from "@/components/cycles/cycle-overview/cycle-plan-associate-modal";
import { CycleTestPlansTable } from "@/components/cycles/cycle-overview/cycle-test-plans-table";
import { useCycleAssigneeStats } from "@/components/cycles/cycle-overview/use-cycle-assignee-stats";
import { useCyclePlans } from "@/components/cycles/cycle-overview/use-cycle-plans";
import useCyclesDetails from "@/components/cycles/active-cycle/use-cycles-details";
import { createFilterUpdateHandler } from "@/components/core/sidebar/progress-stats/shared";
import { useCycle } from "@/hooks/store/use-cycle";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
import { SidebarChartRoot } from "@/plane-web/components/cycles";

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};

const sectionCard = "rounded-lg border border-subtle bg-surface-1";
const workItemStateColorMap: Record<string, string> = {
  completed: "#16a34a",
  started: "#f59e0b",
  unstarted: "#64748b",
  backlog: "#6366f1",
  cancelled: "#ef4444",
};

const validateCycleSnapshot = (cycleDetails: ICycle | null): ICycle | null => {
  if (!cycleDetails || cycleDetails === null) return cycleDetails;
  const updatedCycleDetails: any = { ...cycleDetails };
  if (!isEmpty(cycleDetails.progress_snapshot)) {
    Object.keys(cycleDetails.progress_snapshot || {}).forEach((key) => {
      const currentKey = key as keyof TProgressSnapshot;
      if (!isEmpty(cycleDetails.progress_snapshot) && !isEmpty(updatedCycleDetails)) {
        updatedCycleDetails[currentKey as keyof ICycle] = cycleDetails?.progress_snapshot?.[currentKey];
      }
    });
  }
  return updatedCycleDetails;
};

export const CycleDisplayContent = observer(function CycleDisplayContent(props: Props) {
  const { workspaceSlug, projectId, cycleId } = props;
  const router = useRouter();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const peekCycle = searchParams.get("peekCycle") || undefined;
  const { getCycleById, fetchCycleDetails } = useCycle();
  const { getFilter, updateFilterValueFromSidebar } = useWorkItemFilters();
  const { allowPermissions } = useUserPermissions();
  const [cycleDescriptionModalOpen, setCycleDescriptionModalOpen] = useState(false);
  const [cycleDescriptionModalInitialEdit, setCycleDescriptionModalInitialEdit] = useState(false);

  useCyclesDetails({ workspaceSlug, projectId, cycleId });

  const cycleFilter = getFilter(EIssuesStoreType.CYCLE, cycleId);
  const selectedAssignees = cycleFilter?.findFirstConditionByPropertyAndOperator("assignee_id", "in");
  const selectedAssigneeIds = toFilterArray(selectedAssignees?.value || []) as string[];
  const isEditable = Boolean(!peekCycle) && cycleFilter !== undefined;
  const canEditCycleDescription =
    Boolean(!peekCycle) &&
    allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT);

  const rawCycleDetails = getCycleById(cycleId);
  const cycleDetails = validateCycleSnapshot(rawCycleDetails);
  const totalIssues = cycleDetails?.total_issues ?? 0;
  const completedIssues = cycleDetails?.completed_issues ?? 0;
  const startedIssues = cycleDetails?.started_issues ?? 0;
  const backlogIssues = cycleDetails?.backlog_issues ?? 0;
  const cancelledIssues = cycleDetails?.cancelled_issues ?? 0;
  const unstartedIssues = cycleDetails?.unstarted_issues ?? 0;
  const workItemStateData = [
    { key: "completed", name: "已完成", count: completedIssues },
    { key: "started", name: "进行中", count: startedIssues },
    { key: "unstarted", name: "未开始", count: unstartedIssues },
    { key: "backlog", name: "待处理", count: backlogIssues },
    { key: "cancelled", name: "已取消", count: cancelledIssues },
  ];

  const refreshCycleDetails = () => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    void fetchCycleDetails(workspaceSlug, projectId, cycleId);
  };

  const {
    cyclePlans,
    planAssociateOpen,
    selectablePlans,
    selectablePlansLoading,
    selectablePlansError,
    selectedPlanIds,
    associatingPlans,
    cancelingPlanId,
    setSelectedPlanIds,
    openPlanAssociateModal,
    closePlanAssociateModal,
    handleConfirmAssociatePlans,
    handleCancelPlanAssociation,
  } = useCyclePlans({
    workspaceSlug,
    projectId,
    cycleId,
    fallbackPlans: cycleDetails?.plans,
    onRefresh: refreshCycleDetails,
  });

  const assigneeDistribution = cycleDetails?.distribution?.assignees;

  const handleFiltersUpdate = updateFilterValueFromSidebar.bind(
    updateFilterValueFromSidebar,
    EIssuesStoreType.CYCLE,
    cycleId
  );
  const handleAssigneeFiltersUpdate = createFilterUpdateHandler("assignee_id", selectedAssigneeIds, handleFiltersUpdate);
  const { assigneeStatsRows } = useCycleAssigneeStats({
    workspaceSlug,
    projectId,
    cycleId,
    distributionAssignees: assigneeDistribution,
  });

  const cycleStartDate = getDate(cycleDetails?.start_date);
  const cycleEndDate = getDate(cycleDetails?.end_date);
  const isCycleStartDateValid = cycleStartDate && cycleStartDate <= new Date();
  const isCycleEndDateValid = cycleStartDate && cycleEndDate && cycleEndDate >= cycleStartDate;
  const isCycleDateValid = isCycleStartDateValid && isCycleEndDateValid;

  if (!cycleDetails) {
    return (
      <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
        <div className="flex flex-col gap-5 px-6 py-4">
          <Loader className="max-w-xl">
            <Loader.Item height="16px" />
            <Loader.Item height="16px" />
            <Loader.Item height="16px" />
          </Loader>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
      <div className="flex flex-col gap-5 px-6 py-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3.5fr_6.5fr]">
          <div className={`${sectionCard} flex h-[440px] min-h-0 flex-col p-4`}>
            <div className="mb-3 flex items-center gap-2">
              <Info className="h-3.5 w-3.5 text-placeholder" />
              <span className="text-sm font-medium text-primary">基本信息</span>
            </div>
            <CycleBasicInfoCard
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              cycleId={cycleId}
              cycleDetails={cycleDetails}
              canEdit={canEditCycleDescription}
            />
          </div>

          <div className={`${sectionCard} flex h-[440px] min-h-0 flex-col p-4`}>
            <div className="mb-2 flex items-center gap-2">
              <LineChart className="h-3.5 w-3.5 shrink-0 text-placeholder" aria-hidden />
              <span className="text-sm font-medium text-primary">工作项燃尽图</span>
            </div>
            <div className="min-h-0 flex-1">
              {cycleStartDate && cycleEndDate && isCycleDateValid ? (
                <SidebarChartRoot workspaceSlug={workspaceSlug} projectId={projectId} cycleId={cycleId} />
              ) : (
                <div className="grid h-full place-items-center text-sm text-placeholder">{t("no_data_yet")}</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className={`${sectionCard} flex h-[440px] min-h-0 flex-col overflow-hidden p-4`}>
            <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-placeholder" />
                <span className="text-sm font-medium text-primary">迭代说明</span>
              </div>
              <div className="flex items-center gap-1">
                {canEditCycleDescription ? (
                  <button
                    type="button"
                    className="cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
                    onClick={() => {
                      setCycleDescriptionModalInitialEdit(true);
                      setCycleDescriptionModalOpen(true);
                    }}
                    aria-label="编辑迭代描述"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-surface-2"
                  onClick={() => {
                    setCycleDescriptionModalInitialEdit(false);
                    setCycleDescriptionModalOpen(true);
                  }}
                  aria-label="放大"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                </button>
              </div>
            </div>
            {cycleDetails.description ? (
              <div className="relative min-h-0 flex-1">
                <div className="absolute inset-0 overflow-y-auto pr-1 vertical-scrollbar scrollbar-sm">
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-secondary">
                    {cycleDetails.description}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">暂无迭代描述</div>
            )}
          </div>

          <div className={`${sectionCard} flex h-[440px] min-h-0 flex-col p-4`}>
            <CycleSuggestedTestScope
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              cycleId={cycleId}
              value={cycleDetails.suggested_test_scope}
              canEdit={canEditCycleDescription}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className={`${sectionCard} flex h-[380px] min-h-0 flex-col p-4`}>
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-placeholder" />
              <span className="text-sm font-medium text-primary">负责人工作项统计</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
              {assigneeDistribution ? (
                <div className="overflow-x-auto">
                  <CycleAssigneeStatsTable
                    rows={assigneeStatsRows}
                    onAssigneeClick={handleAssigneeFiltersUpdate}
                    selectedAssigneeIds={selectedAssigneeIds}
                    isEditable={isEditable}
                  />
                </div>
              ) : (
                <div className="grid h-full place-items-center text-sm text-placeholder">{t("no_data_yet")}</div>
              )}
            </div>
          </div>

          <div className={`${sectionCard} flex h-[380px] min-h-0 flex-col p-4`}>
            <div className="mb-3 flex items-center gap-2">
              <LayoutList className="h-3.5 w-3.5 text-placeholder" />
              <span className="text-sm font-medium text-primary">工作项</span>
            </div>
            <div className="min-h-0 flex-1">
              {totalIssues > 0 ? (
                <BarChart
                  className="h-full w-full"
                  data={workItemStateData}
                  bars={[
                    {
                      key: "count",
                      label: "数量",
                      stackId: "work-item-states",
                      fill: (payload: { key: string }) => workItemStateColorMap[payload.key] || "#9ca3af",
                      textClassName: "",
                      showPercentage: false,
                      showTopBorderRadius: () => true,
                      showBottomBorderRadius: () => true,
                    },
                  ]}
                  xAxis={{ key: "name", label: "" }}
                  yAxis={{ key: "count", label: "", allowDecimals: false }}
                  barSize={36}
                  margin={{ top: 20, right: 16, bottom: 5, left: 0 }}
                />
              ) : (
                <div className="grid h-full place-items-center text-sm text-placeholder">{t("no_data_yet")}</div>
              )}
            </div>
          </div>
        </div>

        <div className={`${sectionCard} flex min-h-[300px] flex-col p-4`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-3.5 w-3.5 text-placeholder" />
              <span className="text-sm font-medium text-primary">测试计划</span>
              <span className="text-xs text-placeholder">{cyclePlans.length}</span>
            </div>
            <Button variant="link-neutral" className="p-0" onClick={openPlanAssociateModal} aria-label="关联测试计划">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {cyclePlans.length === 0 ? (
            <div className="grid min-h-[220px] place-items-center text-sm text-placeholder">暂无关联测试计划</div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
              <CycleTestPlansTable
                cyclePlans={cyclePlans}
                cancelingPlanId={cancelingPlanId}
                onOpenPlan={(planId) =>
                  router.push(`/${workspaceSlug}/projects/${projectId}/testhub/plan-cases?planId=${planId}`)
                }
                onCancelPlanAssociation={(planId) => void handleCancelPlanAssociation(planId)}
              />
            </div>
          )}
        </div>

        <CycleActivityTab workspaceSlug={workspaceSlug} projectId={projectId} cycleId={cycleId} />
      </div>

      <CycleDescriptionFullscreenModal
        isOpen={cycleDescriptionModalOpen}
        onClose={() => {
          setCycleDescriptionModalOpen(false);
          setCycleDescriptionModalInitialEdit(false);
        }}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
        description={cycleDetails.description}
        canEdit={canEditCycleDescription}
        initialEditing={cycleDescriptionModalInitialEdit}
      />

      <CyclePlanAssociateModal
        open={planAssociateOpen}
        onCancel={closePlanAssociateModal}
        onConfirm={handleConfirmAssociatePlans}
        selectedPlanIds={selectedPlanIds}
        setSelectedPlanIds={setSelectedPlanIds}
        selectablePlans={selectablePlans}
        selectablePlansLoading={selectablePlansLoading}
        selectablePlansError={selectablePlansError}
        associatingPlans={associatingPlans}
      />
    </div>
  );
});
