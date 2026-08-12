/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ICycle, TCycleGroups } from "@plane/types";
import { useCycle } from "@/hooks/store/use-cycle";
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

/*
 * 完成迭代时曾经有一个「关联需求尚未进入发布单」的软提示。需求阶段改成两端派生、
 * 研发段人工填之后，迭代与需求阶段彻底解耦（迭代事实只产出「已排期」一档），
 * 那句提示已经不成立，整套连同翻页拉取一并删除。
 */

export function useCycleStatusChange(args: TUseCycleStatusChangeArgs) {
  const { workspaceSlug, projectId, cycleId, cycleDetails, canChangeStatus, onSuccess, onError } = args;
  const { t } = useTranslation();
  const { updateCycleDetails } = useCycle();
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [pendingTestingStatus, setPendingTestingStatus] = useState<TCycleGroups | null>(null);

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

  const handleStatusChange = useCallback(
    (nextStatus: TCycleGroups | string) => {
      if (!cycleDetails) return;
      const normalizedNextStatus = nextStatus as TCycleGroups;
      if (
        !normalizedNextStatus ||
        normalizedNextStatus === cycleDetails.status ||
        isUpdatingStatus ||
        !canChangeStatus
      )
        return;

      if (shouldConfirmTestingDates(cycleDetails.status, normalizedNextStatus)) {
        setPendingTestingStatus(normalizedNextStatus);
        return;
      }

      void submitStatusChange({ status: normalizedNextStatus });
    },
    [canChangeStatus, cycleDetails, isUpdatingStatus, submitStatusChange]
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

  return {
    isUpdatingStatus,
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
  };
}
