import { useCallback, useRef, useState } from "react";
import {
  ProjectWorkflowService,
  type TWorkflow,
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

export const useIssueStateTransition = (
  workspaceSlug: string | undefined,
  projectId: string | undefined
) => {
  const [isLoading, setIsLoading] = useState(false);
  const workflowByIssueTypeRef = useRef<Record<string, TWorkflow | null>>({});
  const transitionsByWorkflowRef = useRef<Record<string, TWorkflowTransition[]>>({});

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
      const cachedWorkflow = workflowByIssueTypeRef.current[issueTypeId];
      let workflow = cachedWorkflow;
      if (workflow === undefined) {
        const workflows = await workflowService.fetchWorkflows(workspaceSlug, projectId, issueTypeId);
        workflow = workflows.find((item) => item.is_active) ?? workflows[0] ?? null;
        workflowByIssueTypeRef.current[issueTypeId] = workflow;
      }
      if (!workflow) return [];

      const cachedTransitions = transitionsByWorkflowRef.current[workflow.id];
      if (cachedTransitions) return cachedTransitions;

      const transitions = await workflowService.fetchTransitions(workspaceSlug, projectId, workflow.id);
      transitionsByWorkflowRef.current[workflow.id] = transitions;
      return transitions;
    },
    [projectId, workspaceSlug]
  );

  const resolveAllowedAssigneeIds = useCallback(
    (
      issue: TIssueTransitionContext,
      transition: TWorkflowTransition,
      projectMemberIds: string[]
    ): string[] => {
      if (!projectId) return [];
      const memberIdSet = new Set(projectMemberIds);
      const currentAssigneeIds = normalizeIds(issue.assignee_ids);
      const allowedAssigneeSet = new Set<string>();

      transition.assignee_ids.forEach((token) => {
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
            String(item.from_state_id) === String(issue.state_id) &&
            String(item.to_state_id) === String(toStateId)
        );

        if (!transition || transition.assignee_ids.length === 0) {
          return EMPTY_RESULT;
        }

        const allowedAssigneeIds = resolveAllowedAssigneeIds(issue, transition, projectMemberIds);
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
