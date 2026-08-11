"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectRequirement } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

/** 一次拉全量：单个迭代的关联需求量级很小（几十条内），不做分页交互 */
const CYCLE_REQUIREMENTS_PAGE_SIZE = 100;

type TUseCycleRequirementsProps = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};

/**
 * 迭代概览「关联需求」tab 的局部 state（照同目录 use-cycle-plans 的形状）。
 *
 * 阶段（stage）是纯派生：关联/解除关联后由服务端按关联事实重算，前端只要
 * 重新拉列表就能拿到升降档后的值，不在本地手动改。
 */
export const useCycleRequirements = ({ workspaceSlug, projectId, cycleId }: TUseCycleRequirementsProps) => {
  const { t } = useTranslation();
  const requirementService = useMemo(() => new RequirementService(), []);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [unlinkingRequirementId, setUnlinkingRequirementId] = useState<string | null>(null);

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

  /** 解除关联。阶段降档与留痕由服务端重算，这里只负责刷新列表 */
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

  /** 手动刷新列表。迭代状态流转等外部动作会让服务端重算阶段，成功后由调用方触发 */
  const refreshRequirements = useCallback(() => {
    void mutateRequirements();
  }, [mutateRequirements]);

  return {
    cycleRequirements,
    requirementsLoading,
    requirementsError,
    linkModalOpen,
    unlinkingRequirementId,
    openLinkModal,
    closeLinkModal,
    linkRequirements,
    unlinkRequirement,
    refreshRequirements,
  };
};
