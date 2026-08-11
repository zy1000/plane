/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ICycle, TCycleGroups, TProjectRequirement } from "@plane/types";
import { useCycle } from "@/hooks/store/use-cycle";
import { RequirementService } from "@/services/requirement.service";
import { formatCycleUpdateError } from "./use-cycle-error-message";

type TCycleTestingDatesPayload = {
  endDate: string;
  testHandoffDate: string;
};

type TUseCycleStatusChangeArgs = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  cycleDetails: ICycle | null | undefined;
  canChangeStatus: boolean;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
};

const shouldConfirmTestingDates = (currentStatus: ICycle["status"], nextStatus: TCycleGroups) =>
  currentStatus === "returned" && nextStatus === "testing";

/** 目标状态为「已完成」时走关联需求软提示支路（照 shouldConfirmTestingDates 的既有模式） */
const shouldConfirmLinkedRequirements = (nextStatus: TCycleGroups) => nextStatus === "completed";

/** 软提示只关心尚未进入发布单的档位：已立项 / 已排期 */
const isRequirementNotInRelease = (row: TProjectRequirement) =>
  row.stage === "linked" || row.stage === "planned";

/** 单页大小：单个迭代的关联需求量级通常很小（几十条内） */
const CYCLE_REQUIREMENTS_PAGE_SIZE = 100;

/** 分页安全上限：最多翻 10 页（1000 条），超限就用已取到的子集做软提示 */
const CYCLE_REQUIREMENTS_MAX_PAGES = 10;

/** 按 cursor 翻页拉全量关联需求。只取首页会在超 100 条时计数错误甚至漏弹软提示 */
const fetchAllCycleRequirements = async (
  requirementService: RequirementService,
  workspaceSlug: string,
  projectId: string,
  cycleId: string
): Promise<TProjectRequirement[]> => {
  const allResults: TProjectRequirement[] = [];
  let cursor: string | undefined;
  let page = 0;
  let hasNextPage = true;
  while (hasNextPage && page < CYCLE_REQUIREMENTS_MAX_PAGES) {
    const response = await requirementService.listCycleRequirements(workspaceSlug, projectId, cycleId, {
      perPage: CYCLE_REQUIREMENTS_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    allResults.push(...(response?.results ?? []));
    hasNextPage = Boolean(response?.next_page_results && response?.next_cursor);
    cursor = response?.next_cursor;
    page += 1;
  }
  return allResults;
};

export function useCycleStatusChange(args: TUseCycleStatusChangeArgs) {
  const { workspaceSlug, projectId, cycleId, cycleDetails, canChangeStatus, onSuccess, onError } = args;
  const { t } = useTranslation();
  const { updateCycleDetails } = useCycle();
  const requirementService = useMemo(() => new RequirementService(), []);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [pendingTestingStatus, setPendingTestingStatus] = useState<TCycleGroups | null>(null);
  /** 完成软提示：待确认的目标状态 + 尚未进入发布单的关联需求 */
  const [pendingCompleteStatus, setPendingCompleteStatus] = useState<TCycleGroups | null>(null);
  const [pendingCompleteRequirements, setPendingCompleteRequirements] = useState<TProjectRequirement[]>([]);
  /** 发起检查那一刻的迭代状态，确认提交前复核用；检查在飞期间状态被改掉就作废本次软提示 */
  const [pendingCompleteBaseStatus, setPendingCompleteBaseStatus] = useState<ICycle["status"] | null>(null);
  const [isCheckingRequirements, setIsCheckingRequirements] = useState(false);

  const submitStatusChange = useCallback(
    async (payload: Partial<ICycle>) => {
      if (!canChangeStatus || isUpdatingStatus) return false;

      setIsUpdatingStatus(true);
      try {
        await updateCycleDetails(workspaceSlug, projectId, cycleId, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("project_cycles.action.update.success.title"),
          message: t("project_cycles.action.update.success.description"),
        });
        onSuccess?.();
        return true;
      } catch (error) {
        const { title, message } = formatCycleUpdateError(error);
        setToast({
          type: TOAST_TYPE.ERROR,
          title,
          message,
        });
        onError?.(error);
        return false;
      } finally {
        setIsUpdatingStatus(false);
      }
    },
    [canChangeStatus, cycleId, isUpdatingStatus, onError, onSuccess, projectId, t, updateCycleDetails, workspaceSlug]
  );

  /**
   * 完成前的软提示检查：拉迭代关联需求，过滤出尚未进入发布单（已立项/已排期）的行。
   * 有 → 先弹确认框；没有（或拉取失败）→ 直接放行。**不阻断**，需求阶段永不进入
   * 迭代流转的门槛条件。
   */
  const checkRequirementsBeforeComplete = useCallback(
    async (nextStatus: TCycleGroups, baseStatus: ICycle["status"]) => {
      if (isCheckingRequirements) return;
      setIsCheckingRequirements(true);
      let needsConfirm = false;
      try {
        const rows = await fetchAllCycleRequirements(requirementService, workspaceSlug, projectId, cycleId);
        const notInRelease = rows.filter(isRequirementNotInRelease);
        if (notInRelease.length > 0) {
          setPendingCompleteRequirements(notInRelease);
          setPendingCompleteStatus(nextStatus);
          setPendingCompleteBaseStatus(baseStatus);
          needsConfirm = true;
        }
      } catch {
        // 软提示拉不到数据不能反过来卡住完成动作，直接走原流转
      } finally {
        setIsCheckingRequirements(false);
      }
      if (!needsConfirm) void submitStatusChange({ status: nextStatus });
    },
    [cycleId, isCheckingRequirements, projectId, requirementService, submitStatusChange, workspaceSlug]
  );

  const handleStatusChange = useCallback(
    (nextStatus: TCycleGroups | string) => {
      if (!cycleDetails) return;
      const normalizedNextStatus = nextStatus as TCycleGroups;
      // 完成前检查在飞（isCheckingRequirements）期间同样挡住其他流转，避免确认后补交 completed 覆盖中间流转
      if (
        !normalizedNextStatus ||
        normalizedNextStatus === cycleDetails.status ||
        isUpdatingStatus ||
        isCheckingRequirements ||
        !canChangeStatus
      )
        return;

      if (shouldConfirmTestingDates(cycleDetails.status, normalizedNextStatus)) {
        setPendingTestingStatus(normalizedNextStatus);
        return;
      }

      if (shouldConfirmLinkedRequirements(normalizedNextStatus)) {
        void checkRequirementsBeforeComplete(normalizedNextStatus, cycleDetails.status);
        return;
      }

      void submitStatusChange({ status: normalizedNextStatus });
    },
    [canChangeStatus, checkRequirementsBeforeComplete, cycleDetails, isCheckingRequirements, isUpdatingStatus, submitStatusChange]
  );

  const handleTestingDatesConfirm = useCallback(
    (payload: TCycleTestingDatesPayload) => {
      if (!pendingTestingStatus) return;

      void (async () => {
        const isSuccess = await submitStatusChange({
          status: pendingTestingStatus,
          end_date: payload.endDate,
          test_handoff_date: payload.testHandoffDate,
        });
        if (isSuccess) setPendingTestingStatus(null);
      })();
    },
    [pendingTestingStatus, submitStatusChange]
  );

  const handleTestingDatesCancel = useCallback(() => {
    if (isUpdatingStatus) return;
    setPendingTestingStatus(null);
  }, [isUpdatingStatus]);

  const handleCompleteConfirm = useCallback(() => {
    if (!pendingCompleteStatus) return;

    // 复核：确认瞬间的迭代状态必须与发起检查时一致；期间被其他流转改掉就作废本次软提示，直接关弹窗
    if (cycleDetails?.status !== pendingCompleteBaseStatus) {
      setPendingCompleteStatus(null);
      setPendingCompleteBaseStatus(null);
      setPendingCompleteRequirements([]);
      return;
    }

    void (async () => {
      const isSuccess = await submitStatusChange({ status: pendingCompleteStatus });
      if (isSuccess) {
        setPendingCompleteStatus(null);
        setPendingCompleteBaseStatus(null);
        setPendingCompleteRequirements([]);
      }
    })();
  }, [cycleDetails?.status, pendingCompleteBaseStatus, pendingCompleteStatus, submitStatusChange]);

  const handleCompleteCancel = useCallback(() => {
    if (isUpdatingStatus) return;
    setPendingCompleteStatus(null);
    setPendingCompleteBaseStatus(null);
    setPendingCompleteRequirements([]);
  }, [isUpdatingStatus]);

  return {
    // 检查在飞也算「流转进行中」，一并让下拉等入口 disabled
    isUpdatingStatus: isUpdatingStatus || isCheckingRequirements,
    handleStatusChange,
    testingDatesModalProps: {
      open: pendingTestingStatus !== null,
      loading: isUpdatingStatus,
      entityLabel: "迭代",
      targetStatusLabel: "测试中",
      startDate: cycleDetails?.start_date ?? null,
      endDate: cycleDetails?.end_date ?? null,
      testHandoffDate: cycleDetails?.test_handoff_date ?? null,
      onCancel: handleTestingDatesCancel,
      onConfirm: handleTestingDatesConfirm,
    },
    completeConfirmModalProps: {
      open: pendingCompleteStatus !== null,
      loading: isUpdatingStatus,
      count: pendingCompleteRequirements.length,
      requirementNames: pendingCompleteRequirements.map((row) =>
        [row.display_id, row.title].filter(Boolean).join(" ")
      ),
      onCancel: handleCompleteCancel,
      onConfirm: handleCompleteConfirm,
    },
  };
}
