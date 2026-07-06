import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { TIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { format } from "date-fns";
// components
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { AlertModalCore, Checkbox } from "@plane/ui";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
import { CycleDropdown } from "@/components/dropdowns/cycle";
import { DateDropdown } from "@/components/dropdowns/date";
import { ReleaseDropdown } from "@/components/dropdowns/release/dropdown";
import { IssuePropertyLabels } from "@/components/issues/issue-layouts/properties/labels";
// hooks
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import { useIssues } from "@/hooks/store/use-issues";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
// services
import { IssueService } from "@/services/issue";
import { invalidateIssueApprovalStatus } from "@/services/project/issue-approval-status-cache";
// local imports
import { getBulkStateCompatibility } from "./state-compatibility";

type Props = {
  className?: string;
  isActive?: boolean;
};

// 批量操作栏药丸控件统一样式（覆盖 DropdownButton 默认 h-full / text-caption-md-medium）
const actionPillClassName =
  "w-full inline-flex h-7 max-h-7 shrink-0 items-center justify-start gap-1.5 rounded-md border border-subtle bg-layer-1 px-2 text-body-xs-medium text-primary hover:bg-layer-1-hover transition-colors whitespace-nowrap";

const actionPillContainerClassName = "w-full h-7";

const actionPillLabelClassName = "leading-5";

type TBatchUpdateProperties = {
  state_id?: string | null;
  assignee_ids?: string[];
  start_date?: string | null;
  target_date?: string | null;
  label_ids?: string[];
  cycle_id?: string | null;
  module_ids?: string[];
  release_ids?: string[];
};

type TOptimisticIssuePatchStore = {
  applyOptimisticIssuePatch: (issueId: string, data: Partial<TIssue>) => void;
};

const canApplyOptimisticIssuePatch = (store: unknown): store is TOptimisticIssuePatchStore =>
  typeof (store as TOptimisticIssuePatchStore).applyOptimisticIssuePatch === "function";

export const BulkOperationsActionBar = observer(function BulkOperationsActionBar(props: Props) {
  const { className, isActive = true } = props;
  const { selectedEntityIds, clearSelection } = useMultipleSelectStore();
  const selectedCount = selectedEntityIds.length;
  const { workspaceSlug, projectId } = useParams() as { workspaceSlug?: string; projectId?: string };
  
  // store hooks
  const storeType = useIssueStoreType();
  const { issueMap, issues } = useIssues(storeType);
  const { getProjectStates, getStateById } = useProjectState();
  const projectStates = getProjectStates(projectId ? projectId.toString() : undefined);
  const bulkStateCompatibility = getBulkStateCompatibility({
    issueIds: selectedEntityIds,
    issueMap,
    projectStates,
  });
  const {
    compatibleStateIds,
    hasMissingIssues,
    hasMissingTypes,
    hasMultipleTypes,
    isReady: areCompatibleStatesReady,
    singleTypeId,
    stateIdToTypeStateIdMap,
  } = bulkStateCompatibility;

  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<string[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(null);
  const [selectedDueDate, setSelectedDueDate] = useState<Date | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const issueService = new IssueService();
  const selectedState = selectedStateId ? getStateById(selectedStateId) : undefined;
  const isSelectedStateInvalid =
    !!selectedStateId &&
    (hasMissingIssues ||
      hasMissingTypes ||
      (hasMultipleTypes
        ? compatibleStateIds !== undefined && !compatibleStateIds.includes(selectedStateId)
        : !!singleTypeId && !!selectedState?.issue_type_id && selectedState.issue_type_id !== singleTypeId));

  const isStateDropdownDisabled =
    hasMissingIssues ||
    hasMissingTypes ||
    (hasMultipleTypes && areCompatibleStatesReady && compatibleStateIds?.length === 0);

  const stateDropdownTooltipContent = hasMissingIssues
    ? "选中的工作项详情尚未加载，暂不支持修改状态"
    : hasMissingTypes
      ? "选中的工作项缺少类型，暂不支持修改状态"
      : hasMultipleTypes
        ? areCompatibleStatesReady && compatibleStateIds?.length === 0
          ? "所选工作项类型没有共同可用状态"
          : "仅显示所选工作项类型共同支持的状态"
        : undefined;

  useEffect(() => {
    if (isSelectedStateInvalid) setSelectedStateId(null);
  }, [isSelectedStateInvalid]);

  const hasChanges =
    !!selectedStateId ||
    selectedAssigneeIds.length > 0 ||
    !!selectedStartDate ||
    !!selectedDueDate ||
    selectedLabelIds.length > 0 ||
    !!selectedCycleId ||
    selectedModuleIds.length > 0 ||
    selectedReleaseIds.length > 0;

  const canApplyUpdate =
    workspaceSlug &&
    projectId &&
    selectedCount > 0 &&
    !isUpdating &&
    hasChanges &&
    (!selectedStateId || !isSelectedStateInvalid);

  const handleBatchUpdate = async () => {
    if (!workspaceSlug || !projectId || selectedEntityIds.length === 0) return;
    
    const properties: TBatchUpdateProperties = {};

    if (selectedAssigneeIds.length > 0) properties.assignee_ids = selectedAssigneeIds;
    if (selectedStartDate) properties.start_date = format(selectedStartDate, "yyyy-MM-dd");
    if (selectedDueDate) properties.target_date = format(selectedDueDate, "yyyy-MM-dd");
    if (selectedLabelIds.length > 0) properties.label_ids = selectedLabelIds;
    if (selectedCycleId) properties.cycle_id = selectedCycleId;
    if (selectedModuleIds.length > 0) properties.module_ids = selectedModuleIds;
    if (selectedReleaseIds.length > 0) properties.release_ids = selectedReleaseIds;

    const updatePayloads: { issueIds: string[]; properties: TBatchUpdateProperties }[] = [];

    if (selectedStateId && hasMultipleTypes) {
      const targetStateIdsByTypeId = stateIdToTypeStateIdMap[selectedStateId];
      const issueIdsByTargetStateId = new Map<string, string[]>();

      if (!targetStateIdsByTypeId) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "无法批量更新状态",
          message: "所选状态不适用于当前选中的全部工作项类型。",
        });
        return;
      }

      for (const issueId of selectedEntityIds) {
        const typeId = issueMap[issueId]?.type_id;
        const targetStateId = typeId ? targetStateIdsByTypeId[typeId] : undefined;

        if (!targetStateId) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "无法批量更新状态",
            message: "部分工作项没有可用的目标状态，请重新选择。",
          });
          return;
        }

        issueIdsByTargetStateId.set(targetStateId, [...(issueIdsByTargetStateId.get(targetStateId) ?? []), issueId]);
      }

      issueIdsByTargetStateId.forEach((issueIds, targetStateId) => {
        updatePayloads.push({
          issueIds,
          properties: {
            ...properties,
            state_id: targetStateId,
          },
        });
      });
    } else {
      updatePayloads.push({
        issueIds: selectedEntityIds,
        properties: {
          ...properties,
          ...(selectedStateId ? { state_id: selectedStateId } : {}),
        },
      });
    }

    setIsUpdating(true);
    try {
      const results = await Promise.allSettled(
        updatePayloads.map(async (payload) => {
          const response = await issueService.batchUpdateIssues(workspaceSlug.toString(), projectId.toString(), {
            issue_ids: payload.issueIds,
            properties: payload.properties,
          });
          return { payload, response };
        })
      );

      let blockedCount = 0;
      let updatedCount = 0;
      let failedCount = 0;

      results.forEach((result) => {
        if (result.status === "rejected") {
          failedCount += 1;
          return;
        }

        const { payload, response } = result.value;
        const blockedIssues = response?.blocked_issues ?? [];
        const blockedIssueIds = new Set(blockedIssues.map((item) => item.issue_id));
        const updatedIssueIds =
          response?.updated_issue_ids ?? payload.issueIds.filter((issueId) => !blockedIssueIds.has(issueId));

        updatedCount += updatedIssueIds.length;
        blockedCount += blockedIssues.length;

        if (canApplyOptimisticIssuePatch(issues)) {
          updatedIssueIds.forEach((issueId) => {
            issues.applyOptimisticIssuePatch(issueId, payload.properties);
          });
        }

        if (payload.properties.state_id) {
          blockedIssues.forEach((blockedIssue) => {
            const issue = issueMap[blockedIssue.issue_id];
            if (issue?.project_id) {
              invalidateIssueApprovalStatus(issue.project_id, blockedIssue.issue_id);
            }
          });
        }
      });

      if (failedCount > 0) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "批量更新失败",
          message:
            updatedCount > 0
              ? `已更新 ${updatedCount} 个工作项，另有部分请求失败，请重试。`
              : "更新时发生错误，请稍后重试。",
        });
        return;
      }

      if (blockedCount > 0) {
        setToast({
          type: TOAST_TYPE.INFO,
          title: "部分工作项未直接更新",
          message:
            updatedCount > 0
              ? `已更新 ${updatedCount} 个工作项，另有 ${blockedCount} 个工作项未直接更新或需审批。`
              : `${blockedCount} 个工作项未直接更新或需审批。`,
        });
      } else {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "批量更新成功",
          message: "已更新选中的工作项。",
        });
      }

      // 清空选中
      clearSelection();

      // 重置选择的状态
      setSelectedStateId(null);
      setSelectedAssigneeIds([]);
      setSelectedStartDate(null);
      setSelectedDueDate(null);
      setSelectedLabelIds([]);
      setSelectedCycleId(null);
      setSelectedModuleIds([]);
      setSelectedReleaseIds([]);
      
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenDeleteModal = () => {
    if (selectedEntityIds.length === 0) return;
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    if (isDeleting) return;
    setIsDeleteModalOpen(false);
  };

  const handleBulkDelete = async () => {
    if (!workspaceSlug || !projectId || selectedEntityIds.length === 0) return;
    setIsDeleting(true);
    await issues.removeBulkIssues(workspaceSlug.toString(), projectId.toString(), selectedEntityIds)
      .then(() => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "删除成功",
          message: "已删除选中的工作项。",
        });
        clearSelection();
        setIsDeleteModalOpen(false);
      })
      .catch(() =>
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "删除失败",
          message: "删除时发生错误，请稍后重试。",
        })
      )
      .finally(() => setIsDeleting(false));
  };

  if (!isActive) return null;

  return (
    <div className={cn("sticky bottom-0 left-0 z-[20] flex items-center justify-center", className)}>
      <div className="h-12 w-full bg-surface-1 border border-subtle rounded-md flex items-center gap-3 px-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-3 border-r border-subtle">
            <Checkbox
              checked
              onClick={clearSelection}
              className="size-3.5 !outline-none"
              iconClassName="size-3"
            />
            <span className="text-xs text-secondary">{selectedCount} selected</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="size-7 grid place-items-center rounded-md text-secondary hover:text-primary hover:bg-layer-1 transition-colors"
              onClick={handleOpenDeleteModal}
              disabled={selectedCount === 0}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center  gap-2 flex-wrap flex-grow">
          <Tooltip
            tooltipContent={stateDropdownTooltipContent}
            disabled={!stateDropdownTooltipContent}
            position="top"
          >
            <div>
              <StateDropdown
                projectId={projectId ? projectId.toString() : undefined}
                issueTypeId={singleTypeId}
                stateIds={hasMultipleTypes ? (compatibleStateIds ?? []) : undefined}
                value={selectedStateId}
                onChange={(stateId) => setSelectedStateId(stateId)}
                buttonVariant="transparent-with-text"
                buttonContainerClassName={actionPillContainerClassName}
                buttonClassName={cn(actionPillClassName, isStateDropdownDisabled && "opacity-50 cursor-not-allowed")}
                disabled={isStateDropdownDisabled}
              />
            </div>
          </Tooltip>
          <MemberDropdown
            value={selectedAssigneeIds}
            onChange={(data) => setSelectedAssigneeIds(data)}
            projectId={projectId ? projectId.toString() : undefined}
            disabled={false}
            multiple
            placeholder="Assignees"
            buttonVariant={selectedAssigneeIds.length > 1 ? "transparent-without-text" : "transparent-with-text"}
            buttonClassName={actionPillClassName}
            buttonContainerClassName={actionPillContainerClassName}
            labelClassName={actionPillLabelClassName}
            optionsClassName="z-[20]"
          />
          <DateDropdown
            value={selectedStartDate}
            maxDate={selectedDueDate ?? undefined}
            onChange={(date) => setSelectedStartDate(date)}
            disabled={false}
            placeholder="Start date"
            buttonVariant="transparent-with-text"
            buttonClassName={actionPillClassName}
            buttonContainerClassName={actionPillContainerClassName}
            labelClassName={actionPillLabelClassName}
            optionsClassName="z-[20]"
          />
          <DateDropdown
            value={selectedDueDate}
            minDate={selectedStartDate ?? undefined}
            onChange={(date) => setSelectedDueDate(date)}
            disabled={false}
            placeholder="Due date"
            buttonVariant="transparent-with-text"
            buttonClassName={actionPillClassName}
            buttonContainerClassName={actionPillContainerClassName}
            labelClassName={actionPillLabelClassName}
            optionsClassName="z-[20]"
          />
          <IssuePropertyLabels
            projectId={projectId ? projectId.toString() : null}
            value={selectedLabelIds}
            onChange={(data) => setSelectedLabelIds(data)}
            className="h-7"
            buttonClassName={actionPillClassName}
            maxRender={1}
            placeholderText="Select labels"
            hideDropdownArrow
            noLabelBorder
            fullHeight={false}
          />
          <CycleDropdown
            projectId={projectId ? projectId.toString() : undefined}
            value={selectedCycleId}
            onChange={(cycleId) => setSelectedCycleId(cycleId)}
            disabled={false}
            placeholder="Select cycle"
            buttonVariant="transparent-with-text"
            buttonContainerClassName={actionPillContainerClassName}
            buttonClassName={actionPillClassName}
          />
          <ModuleDropdown
            projectId={projectId ? projectId.toString() : undefined}
            value={selectedModuleIds}
            onChange={(moduleIds) => setSelectedModuleIds(moduleIds ?? [])}
            disabled={false}
            placeholder="Select modules"
            buttonVariant="transparent-with-text"
            buttonContainerClassName={actionPillContainerClassName}
            buttonClassName={actionPillClassName}
            multiple
            showCount
            showTooltip
          />
          <ReleaseDropdown
            projectId={projectId ? projectId.toString() : undefined}
            value={selectedReleaseIds}
            onChange={(releaseIds) => setSelectedReleaseIds(releaseIds ?? [])}
            disabled={false}
            placeholder="Select releases"
            buttonVariant="transparent-with-text"
            buttonContainerClassName={actionPillContainerClassName}
            buttonClassName={actionPillClassName}
            multiple
            showCount
            showTooltip
          />

          {hasChanges && (
            <div className="ml-auto pl-2 border-l border-subtle">
              <Button
                variant="primary"
                size="sm"
                onClick={handleBatchUpdate}
                disabled={!canApplyUpdate}
                loading={isUpdating}
              >
                Update
              </Button>
            </div>
          )}
        </div>
      </div>
      <AlertModalCore
        handleClose={handleCloseDeleteModal}
        handleSubmit={handleBulkDelete}
        isSubmitting={isDeleting}
        isOpen={isDeleteModalOpen}
        title="确认删除"
        content={`确定删除选中的 ${selectedCount} 个工作项吗？此操作不可撤销。`}
        primaryButtonText={{
          loading: "删除中",
          default: "删除",
        }}
        secondaryButtonText="取消"
      />
    </div>
  );
});
