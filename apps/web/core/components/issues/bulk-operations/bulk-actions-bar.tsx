import { useState } from "react";
import { Trash2 } from "lucide-react";
import { runInAction } from "mobx";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { cn } from "@plane/utils";
import { format } from "date-fns";
// components
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Checkbox } from "@plane/ui";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
import { CycleDropdown } from "@/components/dropdowns/cycle";
import { DateDropdown } from "@/components/dropdowns/date";
import { IssuePropertyLabels } from "@/components/issues/issue-layouts/properties/labels";
// hooks
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
// services
import { IssueService } from "@/services/issue";

type Props = {
  className?: string;
};

const actionPillClassName =
  "flex items-center gap-1.5 rounded-md border border-custom-border-200 bg-custom-background-90 px-2 py-1 text-xs text-custom-text-200 hover:bg-custom-background-80 transition-colors whitespace-nowrap";

export const BulkOperationsActionBar = observer(function BulkOperationsActionBar(props: Props) {
  const { className } = props;
  const { selectedEntityIds, clearSelection } = useMultipleSelectStore();
  const selectedCount = selectedEntityIds.length;
  const { workspaceSlug, projectId } = useParams() as { workspaceSlug?: string; projectId?: string };
  
  // store hooks
  const storeType = useIssueStoreType();
  const { issueMap, issues } = useIssues(storeType);

  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(null);
  const [selectedDueDate, setSelectedDueDate] = useState<Date | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const issueService = new IssueService();

  const hasChanges =
    !!selectedStateId ||
    selectedAssigneeIds.length > 0 ||
    !!selectedStartDate ||
    !!selectedDueDate ||
    selectedLabelIds.length > 0 ||
    !!selectedCycleId ||
    selectedModuleIds.length > 0;

  const canApplyUpdate = workspaceSlug && projectId && selectedCount > 0 && !isUpdating && hasChanges;

  const handleBatchUpdate = async () => {
    if (!workspaceSlug || !projectId || selectedEntityIds.length === 0) return;
    
    const properties: {
      state_id?: string | null;
      assignee_ids?: string[];
      start_date?: string | null;
      target_date?: string | null;
      label_ids?: string[];
      cycle_id?: string | null;
      module_ids?: string[];
    } = {};

    if (selectedStateId) properties.state_id = selectedStateId;
    if (selectedAssigneeIds.length > 0) properties.assignee_ids = selectedAssigneeIds;
    if (selectedStartDate) properties.start_date = format(selectedStartDate, "yyyy-MM-dd");
    if (selectedDueDate) properties.target_date = format(selectedDueDate, "yyyy-MM-dd");
    if (selectedLabelIds.length > 0) properties.label_ids = selectedLabelIds;
    if (selectedCycleId) properties.cycle_id = selectedCycleId;
    if (selectedModuleIds.length > 0) properties.module_ids = selectedModuleIds;

    setIsUpdating(true);
    try {
      await issueService.batchUpdateIssues(workspaceSlug.toString(), projectId.toString(), {
        issue_ids: selectedEntityIds,
        properties,
      });

      // 手动更新 MobX store 中的数据以刷新列表
      runInAction(() => {
        selectedEntityIds.forEach((issueId) => {
          const issue = issueMap[issueId];
          if (issue) {
            if (properties.state_id) issue.state_id = properties.state_id;
            if (properties.assignee_ids) issue.assignee_ids = properties.assignee_ids;
            if (properties.start_date) issue.start_date = properties.start_date;
            if (properties.target_date) issue.target_date = properties.target_date;
            if (properties.label_ids) issue.label_ids = properties.label_ids;
            if (properties.cycle_id) issue.cycle_id = properties.cycle_id;
            if (properties.module_ids) issue.module_ids = properties.module_ids;
            // 更新 updated_at 触发 UI 刷新
            issue.updated_at = new Date().toISOString();
          }
        });
      });
      
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

  return (
    <div className={cn("sticky bottom-0 left-0 z-[20] flex items-center justify-center", className)}>
      <div className="h-12 w-full bg-custom-background-100 border border-custom-border-200 rounded-md flex items-center gap-3 px-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-3 border-r border-custom-border-200">
            <Checkbox
              checked
              onClick={clearSelection}
              className="size-3.5 !outline-none"
              iconClassName="size-3"
            />
            <span className="text-xs text-custom-text-300">{selectedCount} selected</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="size-7 grid place-items-center rounded-md text-custom-text-300 hover:text-custom-text-200 hover:bg-custom-background-90 transition-colors"
              onClick={handleOpenDeleteModal}
              disabled={selectedCount === 0}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center  gap-2 flex-wrap flex-grow">
          <StateDropdown
            projectId={projectId ? projectId.toString() : undefined}
            value={selectedStateId}
            onChange={(stateId) => setSelectedStateId(stateId)}
            buttonVariant="transparent-with-text"
            buttonClassName={actionPillClassName}
          />
          <MemberDropdown
            value={selectedAssigneeIds}
            onChange={(data) => setSelectedAssigneeIds(data)}
            projectId={projectId ? projectId.toString() : undefined}
            disabled={false}
            multiple
            placeholder="Assignees"
            buttonVariant={selectedAssigneeIds.length > 1 ? "transparent-without-text" : "transparent-with-text"}
            buttonClassName="text-left rounded-md border border-custom-border-200 bg-custom-background-90 px-2 py-1 text-xs text-custom-text-200 hover:bg-custom-background-80 transition-colors whitespace-nowrap"
            buttonContainerClassName="w-full"
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
            buttonContainerClassName="w-full"
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
            buttonContainerClassName="w-full"
            optionsClassName="z-[20]"
          />
          <IssuePropertyLabels
            projectId={projectId ? projectId.toString() : null}
            value={selectedLabelIds}
            onChange={(data) => setSelectedLabelIds(data)}
            className="h-full"
            buttonClassName="h-full w-full flex items-center gap-1.5 text-xs px-2 py-0.5 hover:bg-custom-background-80 rounded-md border border-custom-border-200 bg-custom-background-90 text-left"
            maxRender={1}
            placeholderText="Select labels"
            noLabelBorder
            fullWidth
            fullHeight
          />
          <CycleDropdown
            projectId={projectId ? projectId.toString() : undefined}
            value={selectedCycleId}
            onChange={(cycleId) => setSelectedCycleId(cycleId)}
            disabled={false}
            placeholder="Select cycle"
            buttonVariant="transparent-with-text"
            buttonContainerClassName="w-full relative flex items-center p-2"
            buttonClassName="relative leading-4 h-4.5 bg-transparent hover:bg-transparent !px-0"
          />
          <ModuleDropdown
            projectId={projectId ? projectId.toString() : undefined}
            value={selectedModuleIds}
            onChange={(moduleIds) => setSelectedModuleIds(moduleIds ?? [])}
            disabled={false}
            placeholder="Select modules"
            buttonVariant="transparent-with-text"
            buttonContainerClassName="w-full relative flex items-center p-2"
            buttonClassName="relative leading-4 h-4.5 bg-transparent hover:bg-transparent !px-0"
            multiple
            showCount
            showTooltip
          />
          
          {hasChanges && (
            <div className="ml-auto pl-2 border-l border-custom-border-200">
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
