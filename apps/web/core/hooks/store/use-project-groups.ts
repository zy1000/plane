/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import type { IProjectGroup, IProjectGroupMember, IProjectGroupRole } from "@plane/types";
import { ProjectGroupService } from "@/services/project";

const projectGroupService = new ProjectGroupService();

type TMemberState = {
  data: IProjectGroupMember[];
  isLoading: boolean;
  loaded: boolean;
  error: string | null;
};

const emptyMemberState = (): TMemberState => ({ data: [], isLoading: false, loaded: false, error: null });

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return fallback;
  const payload = error as Record<string, unknown>;
  const value = payload.error ?? payload.detail ?? payload.role;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return fallback;
};

export type TProjectGroupRoleMutationResult = {
  succeeded: IProjectGroupRole[];
  failures: { roleId: string; message: string }[];
};

export const useProjectGroups = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [groups, setGroups] = useState<IProjectGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [membersByGroupId, setMembersByGroupId] = useState<Record<string, TMemberState>>({});
  const membersRef = useRef(membersByGroupId);
  membersRef.current = membersByGroupId;
  const inFlightRef = useRef(new Set<string>());

  const fetchGroups = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      setGroups(await projectGroupService.list(workspaceSlug, projectId));
    } catch (requestError) {
      setError(getErrorMessage(requestError, "获取项目团队失败"));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  const getGroupMembers = useCallback(
    (groupId: string): TMemberState => membersByGroupId[groupId] ?? emptyMemberState(),
    [membersByGroupId]
  );

  const loadGroupMembers = useCallback(
    async (groupId: string, force = false) => {
      if (!workspaceSlug || !projectId) return;
      if (membersRef.current[groupId]?.loaded && !force) return;
      if (inFlightRef.current.has(groupId)) return;
      inFlightRef.current.add(groupId);
      setMembersByGroupId((prev) => ({
        ...prev,
        [groupId]: { ...(prev[groupId] ?? emptyMemberState()), isLoading: true, error: null },
      }));
      try {
        const data = await projectGroupService.listMembers(workspaceSlug, projectId, groupId);
        setMembersByGroupId((prev) => ({
          ...prev,
          [groupId]: { data, isLoading: false, loaded: true, error: null },
        }));
      } catch (requestError) {
        setMembersByGroupId((prev) => ({
          ...prev,
          [groupId]: {
            ...(prev[groupId] ?? emptyMemberState()),
            isLoading: false,
            loaded: false,
            error: getErrorMessage(requestError, "获取团队成员失败"),
          },
        }));
      } finally {
        inFlightRef.current.delete(groupId);
      }
    },
    [workspaceSlug, projectId]
  );

  const addRoles = useCallback(
    async (groupId: string, roleIds: string[]): Promise<TProjectGroupRoleMutationResult> => {
      if (!workspaceSlug || !projectId) throw new Error("缺少 workspaceSlug 或 projectId");
      const uniqueRoleIds = [...new Set(roleIds)];
      const settled = await Promise.allSettled(
        uniqueRoleIds.map((roleId) => projectGroupService.createRole(workspaceSlug, projectId, groupId, roleId))
      );
      const result: TProjectGroupRoleMutationResult = { succeeded: [], failures: [] };
      settled.forEach((item, index) => {
        if (item.status === "fulfilled") result.succeeded.push(item.value);
        else {
          result.failures.push({
            roleId: uniqueRoleIds[index],
            message: getErrorMessage(item.reason, "添加团队角色失败"),
          });
        }
      });
      setGroups((prev) =>
        prev.map((group) =>
          group.id === groupId
            ? {
                ...group,
                grants: [
                  ...group.grants,
                  ...result.succeeded.filter((grant) => !group.grants.some((item) => item.id === grant.id)),
                ],
              }
            : group
        )
      );
      return result;
    },
    [workspaceSlug, projectId]
  );

  const removeRole = useCallback(
    async (groupId: string, grantId: string): Promise<void> => {
      if (!workspaceSlug || !projectId) throw new Error("缺少 workspaceSlug 或 projectId");
      await projectGroupService.deleteRole(workspaceSlug, projectId, groupId, grantId);
      setGroups((prev) =>
        prev.map((group) =>
          group.id === groupId ? { ...group, grants: group.grants.filter((grant) => grant.id !== grantId) } : group
        )
      );
    },
    [workspaceSlug, projectId]
  );

  return {
    groups,
    isLoading,
    error,
    fetchGroups,
    getGroupMembers,
    loadGroupMembers,
    addRoles,
    removeRole,
  };
};
