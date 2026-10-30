import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { IssueService } from "@/services/issue";
import type { TProjectStagePlanData } from "@/services/project-stage.service";
import { ProjectStageService } from "@/services/project-stage.service";
import { StoreContext } from "@/lib/store-context";
import { useCycle } from "./use-cycle";
import { getProjectStageError } from "./use-project-stages";

const service = new ProjectStageService();
const issueService = new IssueService();

const EMPTY: TProjectStagePlanData = { cycles: [], issues: [] };

/**
 * 规划页的迭代 + 工作项。局部 state，口径同 useProjectStages：进页拉一次，之后只就地改日期，
 * 不随阶段的增删改重拉。
 *
 * 改日期 / 改负责人：迭代走迭代 store（顺带同步 cycleMap），工作项直接打接口再同步根 issuesMap（在里面的才改）；
 * 成功后都只改本地这一条。工作项负责人是多选、下拉每次按受控值拼整份名单，所以先改本地再发请求，
 * 同一条的请求排队发，失败退回上一次的值。
 */
export const useProjectStagePlan = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const { updateCycleDetails } = useCycle();
  // 根工作项表（issuesMap），不是详情 store 那个带 4 个参数、会再打一次接口的 updateIssue
  const issuesMapStore = useContext(StoreContext).issue.issues;
  const [data, setData] = useState<TProjectStagePlanData>(EMPTY);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && projectId));
  const [error, setError] = useState<string | null>(null);
  /** 每个工作项一条请求队列：连点两个人时第二个请求要等第一个回来 */
  const issueQueueRef = useRef(new Map<string, Promise<void>>());

  const fetchPlan = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setError(null);
    try {
      setData((await service.getPlan(workspaceSlug, projectId)) ?? EMPTY);
    } catch (requestError) {
      setError(getProjectStageError(requestError).message);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    setIsLoading(Boolean(workspaceSlug && projectId));
    void fetchPlan();
  }, [fetchPlan, workspaceSlug, projectId]);

  const updateCycleDates = useCallback(
    async (cycleId: string, startDate: string, endDate: string, testHandoffDate?: string) => {
      if (!workspaceSlug || !projectId) return;
      await updateCycleDetails(workspaceSlug, projectId, cycleId, {
        start_date: startDate,
        end_date: endDate,
        ...(testHandoffDate ? { test_handoff_date: testHandoffDate } : {}),
      });
      setData((current) => ({
        ...current,
        cycles: current.cycles.map((cycle) =>
          cycle.id === cycleId
            ? {
                ...cycle,
                start_date: startDate,
                end_date: endDate,
                test_handoff_date: testHandoffDate ?? cycle.test_handoff_date,
              }
            : cycle
        ),
      }));
    },
    [workspaceSlug, projectId, updateCycleDetails]
  );

  const updateIssueDates = useCallback(
    async (issueId: string, startDate: string | null, targetDate: string | null) => {
      if (!workspaceSlug || !projectId) return;
      await issueService.patchIssue(workspaceSlug, projectId, issueId, {
        start_date: startDate,
        target_date: targetDate,
      });
      issuesMapStore.updateIssue(issueId, { start_date: startDate, target_date: targetDate });
      setData((current) => ({
        ...current,
        issues: current.issues.map((issue) =>
          issue.id === issueId ? { ...issue, start_date: startDate, target_date: targetDate } : issue
        ),
      }));
    },
    [workspaceSlug, projectId, issuesMapStore]
  );

  const updateCycleOwner = useCallback(
    async (cycleId: string, ownerId: string) => {
      if (!workspaceSlug || !projectId) return;
      await updateCycleDetails(workspaceSlug, projectId, cycleId, { owned_by_id: ownerId });
      setData((current) => ({
        ...current,
        cycles: current.cycles.map((cycle) => (cycle.id === cycleId ? { ...cycle, owned_by_id: ownerId } : cycle)),
      }));
    },
    [workspaceSlug, projectId, updateCycleDetails]
  );

  const setIssueAssigneesLocal = useCallback((issueId: string, assigneeIds: string[]) => {
    setData((current) => ({
      ...current,
      issues: current.issues.map((issue) => (issue.id === issueId ? { ...issue, assignee_ids: assigneeIds } : issue)),
    }));
  }, []);

  const updateIssueAssignees = useCallback(
    (issueId: string, assigneeIds: string[]) => {
      if (!workspaceSlug || !projectId) return Promise.resolve();
      const previous = dataRef.current.issues.find((issue) => issue.id === issueId)?.assignee_ids ?? [];
      setIssueAssigneesLocal(issueId, assigneeIds);
      const run = async () => {
        try {
          await issueService.patchIssue(workspaceSlug, projectId, issueId, { assignee_ids: assigneeIds });
          issuesMapStore.updateIssue(issueId, { assignee_ids: assigneeIds });
        } catch (requestError) {
          setIssueAssigneesLocal(issueId, previous);
          throw requestError;
        }
      };
      const queued = (issueQueueRef.current.get(issueId) ?? Promise.resolve()).catch(() => undefined).then(run);
      issueQueueRef.current.set(issueId, queued);
      return queued;
    },
    [workspaceSlug, projectId, issuesMapStore, setIssueAssigneesLocal]
  );

  return {
    data,
    isLoading,
    error,
    refresh: fetchPlan,
    updateCycleDates,
    updateIssueDates,
    updateCycleOwner,
    updateIssueAssignees,
  };
};
