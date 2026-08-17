"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectRequirement, TRequirementItemStatus } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

/** 一次拉全量：单个迭代的关联需求量级很小（几十条内），不做分页交互 */
const CYCLE_REQUIREMENTS_PAGE_SIZE = 100;

type TUseCycleRequirementsProps = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};

/**
 * 迭代「范围 · 需求」子页的局部 state（照同目录 use-cycle-plans 的形状）。
 *
 * 需求级交付状态人工维护，走 updateStatus（写的是需求本体，跨项目共享一份）；
 * 唯一的自动推进是关联进项目时 not_started → projected，由服务端做，重拉列表即可。
 *
 * SWR key 只跟 workspace/project/cycle 走，所以页面、header、pane 各自 useCycleRequirements
 * 拿到的是同一份缓存 —— header 里关联完需求，页面那份列表会跟着刷新，不需要额外的
 * 跨树通信。
 */
export const useCycleRequirements = ({ workspaceSlug, projectId, cycleId }: TUseCycleRequirementsProps) => {
  const { t } = useTranslation();
  const requirementService = useMemo(() => new RequirementService(), []);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [unlinkingRequirementId, setUnlinkingRequirementId] = useState<string | null>(null);
  const [updatingStatusRequirementId, setUpdatingStatusRequirementId] = useState<string | null>(null);

  const {
    data: requirementsResp,
    error: requirementsSwrError,
    mutate: mutateRequirements,
  } = useSWR(
    workspaceSlug && projectId && cycleId ? `cycle-requirements-${workspaceSlug}-${projectId}-${cycleId}` : null,
    () =>
      requirementService.listCycleRequirements(workspaceSlug, projectId, cycleId, {
        perPage: CYCLE_REQUIREMENTS_PAGE_SIZE,
      })
  );

  const cycleRequirements: TProjectRequirement[] = useMemo(
    () => requirementsResp?.results ?? [],
    [requirementsResp]
  );
  const requirementsLoading = !requirementsResp && !requirementsSwrError;
  const requirementsError: string | null = requirementsSwrError
    ? requirementsSwrError?.error ||
      requirementsSwrError?.detail ||
      t("project_requirements.container.toast_failed")
    : null;

  const openLinkModal = useCallback(() => setLinkModalOpen(true), []);
  const closeLinkModal = useCallback(() => setLinkModalOpen(false), []);

  /** 批量关联。失败往外抛，由关联弹窗就地提示并保留选择现场 */
  const linkRequirements = useCallback(
    async (requirementIds: string[]) => {
      if (!workspaceSlug || !projectId || !cycleId || requirementIds.length === 0) return;
      await requirementService.linkRequirementsToCycle(workspaceSlug, projectId, cycleId, {
        requirements: requirementIds,
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("project_requirements.container.toast_linked"),
        message: t("project_requirements.toast.linked", { count: requirementIds.length }),
      });
      void mutateRequirements();
    },
    [cycleId, mutateRequirements, projectId, requirementService, t, workspaceSlug]
  );

  /** 解除关联。留痕由服务端处理，这里只负责刷新列表 */
  const unlinkRequirement = useCallback(
    async (requirementId: string) => {
      if (!workspaceSlug || !projectId || !cycleId) return;
      try {
        setUnlinkingRequirementId(requirementId);
        await requirementService.unlinkRequirementFromCycle(workspaceSlug, projectId, cycleId, requirementId);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("project_requirements.container.toast_unlinked"),
        });
        void mutateRequirements();
      } catch (error: any) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("project_requirements.container.toast_failed"),
          message: error?.error || error?.detail || t("project_requirements.toast.failed"),
        });
      } finally {
        setUnlinkingRequirementId(null);
      }
    },
    [cycleId, mutateRequirements, projectId, requirementService, t, workspaceSlug]
  );

  /**
   * 人工改需求级交付状态。写的是需求本体（状态跨项目共享一份，不长在迭代上），
   * 走项目侧的 updateProjectRequirement 而不是迭代的端点。落库结果以重拉的列表为准，
   * 不做乐观更新。
   */
  const updateStatus = useCallback(
    async (requirementId: string, status: TRequirementItemStatus) => {
      if (!workspaceSlug || !projectId) return;
      try {
        setUpdatingStatusRequirementId(requirementId);
        await requirementService.updateProjectRequirement(workspaceSlug, projectId, requirementId, { status });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("project_requirements.toast.status_updated", {
            status: t(`requirement_fields.statuses.${status}`),
          }),
        });
        void mutateRequirements();
      } catch (error: any) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("project_requirements.container.toast_failed"),
          message: error?.error || error?.detail || t("project_requirements.toast.failed"),
        });
      } finally {
        setUpdatingStatusRequirementId(null);
      }
    },
    [mutateRequirements, projectId, requirementService, t, workspaceSlug]
  );

  return {
    cycleRequirements,
    requirementsLoading,
    requirementsError,
    linkModalOpen,
    unlinkingRequirementId,
    updatingStatusRequirementId,
    openLinkModal,
    closeLinkModal,
    linkRequirements,
    unlinkRequirement,
    updateStatus,
  };
};
