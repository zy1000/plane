"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CycleService } from "@/services/cycle.service";

type TUseCyclePlansProps = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  fallbackPlans?: any;
  onRefresh?: () => void;
};

const resolveCyclePlans = (cyclePlansResp: { data: any[] } | undefined, fallbackPlans: any): any[] => {
  if (cyclePlansResp && Array.isArray(cyclePlansResp.data)) return cyclePlansResp.data;
  if (Array.isArray(fallbackPlans)) return fallbackPlans;
  if (fallbackPlans && Array.isArray(fallbackPlans.data)) return fallbackPlans.data;
  return [];
};

export const useCyclePlans = ({
  workspaceSlug,
  projectId,
  cycleId,
  fallbackPlans,
  onRefresh,
}: TUseCyclePlansProps) => {
  const cycleService = useMemo(() => new CycleService(), []);
  const [planAssociateOpen, setPlanAssociateOpen] = useState(false);
  const [selectablePlans, setSelectablePlans] = useState<any[]>([]);
  const [selectablePlansLoading, setSelectablePlansLoading] = useState(false);
  const [selectablePlansError, setSelectablePlansError] = useState<string | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [associatingPlans, setAssociatingPlans] = useState(false);
  const [cancelingPlanId, setCancelingPlanId] = useState<string | null>(null);

  const { data: cyclePlansResp, mutate: mutateCyclePlans } = useSWR(
    workspaceSlug && projectId && cycleId ? `cycle-plans-${workspaceSlug}-${projectId}-${cycleId}` : null,
    () => cycleService.getCyclePlans(workspaceSlug, projectId, cycleId)
  );

  const cyclePlans = useMemo(
    () => resolveCyclePlans(cyclePlansResp, fallbackPlans),
    [cyclePlansResp, fallbackPlans]
  );

  const refresh = useCallback(() => {
    void mutateCyclePlans();
    onRefresh?.();
  }, [mutateCyclePlans, onRefresh]);

  const openPlanAssociateModal = useCallback(async () => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    setPlanAssociateOpen(true);
    setSelectedPlanIds([]);
    setSelectablePlansLoading(true);
    setSelectablePlansError(null);
    try {
      const res = await cycleService.getCycleSelectablePlans(workspaceSlug, projectId, cycleId);
      setSelectablePlans(Array.isArray(res?.data) ? res.data : []);
    } catch (error: any) {
      setSelectablePlansError(error?.error || error?.detail || "获取可选测试计划失败");
      setSelectablePlans([]);
    } finally {
      setSelectablePlansLoading(false);
    }
  }, [cycleId, cycleService, projectId, workspaceSlug]);

  const closePlanAssociateModal = useCallback(() => {
    setPlanAssociateOpen(false);
    setSelectedPlanIds([]);
  }, []);

  const handleConfirmAssociatePlans = useCallback(async () => {
    if (!workspaceSlug || !projectId || !cycleId || selectedPlanIds.length === 0) return;
    try {
      setAssociatingPlans(true);
      await cycleService.associateCyclePlans(workspaceSlug, projectId, cycleId, selectedPlanIds);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "关联成功",
        message: `已关联 ${selectedPlanIds.length} 个测试计划`,
      });
      setPlanAssociateOpen(false);
      setSelectedPlanIds([]);
      refresh();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "关联失败",
        message: error?.error || error?.detail || "请稍后重试",
      });
    } finally {
      setAssociatingPlans(false);
    }
  }, [cycleId, cycleService, projectId, refresh, selectedPlanIds, workspaceSlug]);

  const handleCancelPlanAssociation = useCallback(
    async (planId: string) => {
      if (!workspaceSlug || !projectId || !cycleId) return;
      try {
        setCancelingPlanId(planId);
        await cycleService.cancelCyclePlanAssociation(workspaceSlug, projectId, cycleId, [planId]);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "已取消关联",
          message: "测试计划已取消关联",
        });
        refresh();
      } catch (error: any) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "操作失败",
          message: error?.error || error?.detail || "请稍后重试",
        });
      } finally {
        setCancelingPlanId(null);
      }
    },
    [cycleId, cycleService, projectId, refresh, workspaceSlug]
  );

  return {
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
  };
};
