import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel, PROJECT_SPRINTS_EDIT_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectStage } from "@plane/types";
import { Loader } from "@plane/ui";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { useProjectStagePlan } from "@/hooks/store/use-project-stage-plan";
import { getProjectStageError, useProjectStages } from "@/hooks/store/use-project-stages";
import { useStageTypes } from "@/hooks/store/use-stage-types";
import { useUserPermissions } from "@/hooks/store/user";
import { PROJECT_PLAN_HEADER_ACTIONS_ID } from "../header-slots";
import { useProjectStagePermissions } from "../permissions";
import type { TProjectStageFormMode } from "../project-stage-form-modal";
import { ProjectStageFormModal } from "../project-stage-form-modal";
import type { TPlanOwnerChange } from "./plan-owner-cell";
import { ProjectStagePlanView } from "./project-stage-plan-view";
import type { TPlanDates, TPlanDragTarget } from "./use-plan-bar-drag";

const I18N = "project_stage";

/**
 * 项目「规划」子菜单：阶段 › 迭代 › 工作项一张时间轴。
 *
 * 阶段数据和阶段页走同一个接口；三类条都能在图上拖着改起止、点负责人头像换人，权限各走各的：
 * 阶段看阶段管理权限、迭代看 sprints.edit、工作项看项目成员。点阶段名打开阶段编辑弹窗。
 * 页头搜索 portal 进路由 header 的挂点。
 */
export const ProjectPlan = observer(function ProjectPlan({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const { canManage } = useProjectStagePermissions(workspaceSlug, projectId);
  const { allowProjectPermissionKeys, allowPermissions } = useUserPermissions();
  const { stageTypes } = useStageTypes(workspaceSlug);
  const stageState = useProjectStages(workspaceSlug, projectId);
  const { stages, createStage, updateStage, workloadTotal } = stageState;
  const plan = useProjectStagePlan(workspaceSlug, projectId);

  const [search, setSearch] = useState("");
  // 弹窗按 form 对象变化重置字段，所以存对象本身，别每次渲染现拼
  const [form, setForm] = useState<TProjectStageFormMode | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setActionsHost(document.getElementById(PROJECT_PLAN_HEADER_ACTIONS_ID));
  }, []);

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  // 不做 useMemo：权限读的是 observable
  const canEdit = {
    stage: canManage,
    cycle: allowProjectPermissionKeys([PROJECT_SPRINTS_EDIT_PERMISSION_KEY], workspaceSlug, projectId),
    issue: allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
      EUserPermissionsLevel.PROJECT,
      workspaceSlug,
      projectId
    ),
  };

  const toastError = useCallback(
    (requestError: unknown, titleKey: string) => {
      const { message, code } = getProjectStageError(requestError);
      const key = code ? `${I18N}.errors.${code.toLowerCase()}` : "";
      const known = key ? t(key) : "";
      setToast({ type: TOAST_TYPE.ERROR, title: t(titleKey), message: known && known !== key ? known : message });
    },
    [t]
  );

  const commitDates = useCallback(
    async (target: TPlanDragTarget, { start, end, testHandoff }: TPlanDates) => {
      try {
        if (target.kind === "stage") await updateStage(target.stage.id, { start_date: start, end_date: end });
        else if (target.kind === "cycle") await plan.updateCycleDates(target.cycle.id, start, end, testHandoff);
        else await plan.updateIssueDates(target.issue.id, start, end);
      } catch (requestError) {
        toastError(requestError, `${I18N}.plan.update_error`);
      }
    },
    [updateStage, plan.updateCycleDates, plan.updateIssueDates, toastError]
  );

  const changeOwner = useCallback(
    async (change: TPlanOwnerChange) => {
      try {
        if (change.kind === "stage") await updateStage(change.stageId, { owner_id: change.ownerId });
        else if (change.kind === "cycle") await plan.updateCycleOwner(change.cycleId, change.ownerId);
        else await plan.updateIssueAssignees(change.issueId, change.assigneeIds);
      } catch (requestError) {
        toastError(requestError, `${I18N}.toast.update_error`);
      }
    },
    [updateStage, plan.updateCycleOwner, plan.updateIssueAssignees, toastError]
  );

  const clearDates = useCallback(
    async (target: TPlanDragTarget) => {
      try {
        // 阶段的开始日期系统不允许清空，清排期 = 清结束（后端连周期一起清）；迭代必须有起止，菜单不给
        if (target.kind === "stage") await updateStage(target.stage.id, { end_date: null });
        else if (target.kind === "issue") await plan.updateIssueDates(target.issue.id, null, null);
      } catch (requestError) {
        toastError(requestError, `${I18N}.plan.update_error`);
      }
    },
    [updateStage, plan.updateIssueDates, toastError]
  );

  const isLoading = stageState.isLoading || plan.isLoading;
  const error = stageState.error ?? plan.error;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {actionsHost &&
        createPortal(
          <PageSearchInput searchQuery={search} updateSearchQuery={setSearch} placeholder={t(`${I18N}.plan.search`)} />,
          actionsHost
        )}

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <Loader className="flex flex-col gap-2 p-6">
            <Loader.Item height="36px" />
            <Loader.Item height="36px" />
            <Loader.Item height="36px" />
          </Loader>
        ) : error ? (
          <div className="grid h-full place-items-center p-6 text-13 text-danger-primary">{error}</div>
        ) : (
          <ProjectStagePlanView
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            stages={stages}
            data={plan.data}
            search={search}
            canEdit={canEdit}
            today={today}
            onEditStage={(stage) => setForm({ mode: "edit", stage })}
            onCommitDates={commitDates}
            onChangeOwner={(change) => void changeOwner(change)}
            onClearDates={(target) => void clearDates(target)}
          />
        )}
      </div>

      <ProjectStageFormModal
        isOpen={form !== null}
        form={form}
        projectId={projectId}
        stages={stages}
        stageTypes={stageTypes}
        workloadTotal={workloadTotal}
        isSubmitting={stageState.isMutating}
        onClose={() => setForm(null)}
        onCreate={createStage}
        onUpdate={async (stageId, payload) => {
          await updateStage(stageId, payload);
          setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.updated`) });
        }}
      />
    </div>
  );
});
