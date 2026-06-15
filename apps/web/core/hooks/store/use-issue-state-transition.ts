import { useCallback, useRef, useState } from "react";
import {
  ProjectWorkflowService,
  type TWorkflowFlowchart,
  type TWorkflowTransition,
} from "@/services/project/project-workflow.service";
import { useMember } from "./use-member";

const ROLE_TOKEN_PREFIX = "role:";
const SPECIAL_ASSIGNEES_TOKEN = "special:assignees";
const SPECIAL_CREATED_BY_TOKEN = "special:created_by";

type TIssueTransitionContext = {
  type_id?: string | null;
  state_id?: string | null;
  assignee_ids?: string[] | null;
  created_by?: string | null;
};

type TTransitionAssigneeRule = {
  fromStateId: string | null;
  toStateId: string | null;
  assigneeTokens: string[];
};

export type TStateTransitionCheckResult = {
  shouldPromptAssigneeSelection: boolean;
  allowedAssigneeIds: string[];
};

const EMPTY_RESULT: TStateTransitionCheckResult = {
  shouldPromptAssigneeSelection: false,
  allowedAssigneeIds: [],
};

const workflowService = new ProjectWorkflowService();

const normalizeIds = (ids: Array<string | null | undefined> | undefined | null) =>
  Array.from(new Set((ids ?? []).filter(Boolean) as string[]));

const mapFlowchartToTransitionRules = (flowchart?: TWorkflowFlowchart | null): TTransitionAssigneeRule[] => {
  if (!flowchart) return [];

  return flowchart.transitions.map((transition) => ({
    fromStateId: transition.from_state_id ? String(transition.from_state_id) : null,
    toStateId: transition.to_state_id ? String(transition.to_state_id) : null,
    assigneeTokens: transition.assignees
      .map((principal) => {
        if (principal.kind === "member") return principal.id;
        if (principal.kind === "role") return `${ROLE_TOKEN_PREFIX}${principal.id}`;
        if (principal.kind === "dynamic") return `special:${principal.id}`;
        return null;
      })
      .filter((token): token is string => Boolean(token)),
  }));
};

export const useIssueStateTransition = (
  workspaceSlug: string | undefined,
  projectId: string | undefined
) => {
  const [isLoading, setIsLoading] = useState(false);
  const transitionRulesByIssueTypeRef = useRef<Record<string, TTransitionAssigneeRule[] | undefined>>({});

  const {
    project: { getProjectMemberIds, getProjectMemberDetails, fetchProjectMembers },
  } = useMember();

  const ensureProjectMemberIds = useCallback(async () => {
    if (!projectId) return [];
    let memberIds = getProjectMemberIds(projectId, false);
    if (!memberIds) {
      await fetchProjectMembers(workspaceSlug ?? "", projectId);
      memberIds = getProjectMemberIds(projectId, false);
    }
    return memberIds ?? [];
  }, [fetchProjectMembers, getProjectMemberIds, projectId, workspaceSlug]);

  const ensureTransitions = useCallback(
    async (issueTypeId: string) => {
      if (!workspaceSlug || !projectId) return [];
      const cachedTransitions = transitionRulesByIssueTypeRef.current[issueTypeId];
      if (cachedTransitions !== undefined) return cachedTransitions;

      try {
        const workflows = await workflowService.fetchWorkflows(workspaceSlug, projectId, issueTypeId);
        const workflow = workflows.find((item) => item.is_active) ?? workflows[0] ?? null;
        if (!workflow) {
          transitionRulesByIssueTypeRef.current[issueTypeId] = [];
          return [];
        }
        const transitions = await workflowService.fetchTransitions(workspaceSlug, projectId, workflow.id);
        const rules = transitions.map((transition: TWorkflowTransition) => ({
          fromStateId: transition.from_state_id ? String(transition.from_state_id) : null,
          toStateId: transition.to_state_id ? String(transition.to_state_id) : null,
          assigneeTokens: transition.assignee_ids ?? [],
        }));
        transitionRulesByIssueTypeRef.current[issueTypeId] = rules;
        return rules;
      } catch {
        // 非工作流管理员可能拿不到 workflow.view；回退到项目成员可读的 flowchart 接口。
        const flowcharts = await workflowService.fetchWorkflowFlowchart(
          workspaceSlug,
          projectId,
          issueTypeId
        );
        const flowchart = flowcharts.find((item) => item.issue_type_id === issueTypeId) ?? flowcharts[0] ?? null;
        const rules = mapFlowchartToTransitionRules(flowchart);
        transitionRulesByIssueTypeRef.current[issueTypeId] = rules;
        return rules;
      }
    },
    [projectId, workspaceSlug]
  );

  const resolveAllowedAssigneeIds = useCallback(
    (
      issue: TIssueTransitionContext,
      assigneeTokens: string[],
      projectMemberIds: string[]
    ): string[] => {
      if (!projectId) return [];
      const memberIdSet = new Set(projectMemberIds);
      const currentAssigneeIds = normalizeIds(issue.assignee_ids);
      const allowedAssigneeSet = new Set<string>();

      assigneeTokens.forEach((token) => {
        if (token === SPECIAL_ASSIGNEES_TOKEN) {
          currentAssigneeIds.forEach((id) => {
            if (memberIdSet.has(id)) allowedAssigneeSet.add(id);
          });
          return;
        }
        if (token === SPECIAL_CREATED_BY_TOKEN) {
          if (issue.created_by && memberIdSet.has(issue.created_by)) {
            allowedAssigneeSet.add(issue.created_by);
          }
          return;
        }
        if (token.startsWith(ROLE_TOKEN_PREFIX)) {
          const roleId = token.slice(ROLE_TOKEN_PREFIX.length);
          if (!roleId) return;
          projectMemberIds.forEach((memberId) => {
            const memberDetails = getProjectMemberDetails(memberId, projectId);
            if (memberDetails?.custom_role_ids?.includes(roleId)) {
              allowedAssigneeSet.add(memberId);
            }
          });
          return;
        }
        if (memberIdSet.has(token)) {
          allowedAssigneeSet.add(token);
        }
      });

      return Array.from(allowedAssigneeSet);
    },
    [getProjectMemberDetails, projectId]
  );

  const evaluateStateTransition = useCallback(
    async (
      issue: TIssueTransitionContext,
      toStateId: string
    ): Promise<TStateTransitionCheckResult> => {
      if (!workspaceSlug || !projectId || !issue?.type_id || !issue?.state_id || !toStateId) {
        return EMPTY_RESULT;
      }

      if (String(issue.state_id) === String(toStateId)) {
        return EMPTY_RESULT;
      }

      setIsLoading(true);
      try {
        const [projectMemberIds, transitions] = await Promise.all([
          ensureProjectMemberIds(),
          ensureTransitions(issue.type_id),
        ]);
        const transition = transitions.find(
          (item) =>
            String(item.fromStateId) === String(issue.state_id) &&
            String(item.toStateId) === String(toStateId)
        );

        if (!transition || transition.assigneeTokens.length === 0) {
          return EMPTY_RESULT;
        }

        const allowedAssigneeIds = resolveAllowedAssigneeIds(
          issue,
          transition.assigneeTokens,
          projectMemberIds
        );
        const currentAssigneeIds = normalizeIds(issue.assignee_ids);
        const allowedSet = new Set(allowedAssigneeIds);
        const assigneesAreCompliant = currentAssigneeIds.every((id) => allowedSet.has(id));

        return {
          shouldPromptAssigneeSelection: !assigneesAreCompliant,
          allowedAssigneeIds,
        };
      } catch {
        return EMPTY_RESULT;
      } finally {
        setIsLoading(false);
      }
    },
    [ensureProjectMemberIds, ensureTransitions, projectId, resolveAllowedAssigneeIds, workspaceSlug]
  );

  return {
    isLoading,
    evaluateStateTransition,
  };
};
