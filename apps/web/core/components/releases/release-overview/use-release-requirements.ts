"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectRequirement } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

type TUseReleaseRequirementsProps = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  /** 抽屉/页面不可见时不发请求 */
  enabled?: boolean;
};

// 与后端 CustomPaginator.max_page_size 一致；发布单关联需求量级有限，一页取满即可
const PAGE_SIZE = 100;

/**
 * 关联需求列表的 SWR key。
 *
 * 导出是为了让**不展示这份列表**的地方（发布概览页）也能在状态流转后按 key 失效缓存 ——
 * 服务端会重算需求阶段，而列表现在住在 /releases/:id 的需求子页上。用全局 mutate 而不是
 * 再挂一个 hook，省掉概览页一次没人看的请求。
 */
export const getReleaseRequirementsKey = (workspaceSlug: string, projectId: string, releaseId: string) =>
  `release-requirements-${workspaceSlug}-${projectId}-${releaseId}`;

/**
 * 发布单「关联需求」section 的局部状态（照 cycles/cycle-overview/use-cycle-plans.ts 风格）。
 *
 * 列表、批量关联、解除关联都走这里；阶段的升降档（待验证/已发布/退回）由服务端
 * 按关联事实重算，前端只负责动作完成后刷新列表。
 */
export const useReleaseRequirements = ({
  workspaceSlug,
  projectId,
  releaseId,
  enabled = true,
}: TUseReleaseRequirementsProps) => {
  const { t } = useTranslation();
  const requirementService = useMemo(() => new RequirementService(), []);
  const [requirementAssociateOpen, setRequirementAssociateOpen] = useState(false);
  const [unlinkingRequirementId, setUnlinkingRequirementId] = useState<string | null>(null);

  const {
    data: requirementsResp,
    error: requirementsFetchError,
    isLoading: requirementsLoading,
    mutate: mutateRequirements,
  } = useSWR(
    enabled && workspaceSlug && projectId && releaseId
      ? getReleaseRequirementsKey(workspaceSlug, projectId, releaseId)
      : null,
    () => requirementService.listReleaseRequirements(workspaceSlug, projectId, releaseId, { perPage: PAGE_SIZE })
  );

  const requirements: TProjectRequirement[] = useMemo(
    () => requirementsResp?.results ?? [],
    [requirementsResp]
  );

  const requirementsError = requirementsFetchError
    ? (requirementsFetchError?.error ?? requirementsFetchError?.detail ?? t("project_requirements.container.toast_failed"))
    : null;

  const refresh = useCallback(() => {
    void mutateRequirements();
  }, [mutateRequirements]);

  const openRequirementAssociateModal = useCallback(() => setRequirementAssociateOpen(true), []);

  const closeRequirementAssociateModal = useCallback(() => setRequirementAssociateOpen(false), []);

  /** 弹窗多选提交。失败往上抛，由弹窗就地提示 */
  const handleLinkRequirements = useCallback(
    async (requirementIds: string[]) => {
      if (!workspaceSlug || !projectId || !releaseId || requirementIds.length === 0) return;
      await requirementService.linkRequirementsToRelease(workspaceSlug, projectId, releaseId, {
        requirements: requirementIds,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_requirements.container.toast_linked") });
      refresh();
    },
    [projectId, refresh, releaseId, requirementService, t, workspaceSlug]
  );

  const handleUnlinkRequirement = useCallback(
    async (requirementId: string) => {
      if (!workspaceSlug || !projectId || !releaseId) return;
      try {
        setUnlinkingRequirementId(requirementId);
        await requirementService.unlinkRequirementFromRelease(workspaceSlug, projectId, releaseId, requirementId);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_requirements.container.toast_unlinked") });
        refresh();
      } catch (error) {
        const payload = error as { error?: string; detail?: string } | null;
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("project_requirements.container.toast_failed"),
          message: payload?.error ?? payload?.detail,
        });
      } finally {
        setUnlinkingRequirementId(null);
      }
    },
    [projectId, refresh, releaseId, requirementService, t, workspaceSlug]
  );

  return {
    requirements,
    requirementsLoading,
    requirementsError,
    requirementAssociateOpen,
    unlinkingRequirementId,
    openRequirementAssociateModal,
    closeRequirementAssociateModal,
    handleLinkRequirements,
    handleUnlinkRequirement,
    /** 供外部动作（如发布/驳回）成功后主动刷新关联需求列表 */
    refresh,
  };
};
