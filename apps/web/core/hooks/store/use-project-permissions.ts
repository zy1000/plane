import { useCallback, useEffect, useState } from "react";
import { ProjectMemberService } from "@/services/project/project-member.service";

const projectMemberService = new ProjectMemberService();

type TState = {
  permissionKeys: Set<string>;
  isLoading: boolean;
  fetched: boolean;
};

/**
 * 获取当前用户在指定项目中的有效 permission_keys，并提供按 key 查询的工具函数。
 */
export const useProjectPermissions = (
  workspaceSlug: string | undefined,
  projectId: string | undefined
) => {
  const [state, setState] = useState<TState>({
    permissionKeys: new Set(),
    isLoading: false,
    fetched: false,
  });

  const fetchPermissions = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const keys = await projectMemberService.getMyPermissionKeys(workspaceSlug, projectId);
      setState({ permissionKeys: new Set(keys), isLoading: false, fetched: true });
    } catch {
      setState({ permissionKeys: new Set(), isLoading: false, fetched: true });
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback(
    (key: string) => state.permissionKeys.has(key),
    [state.permissionKeys]
  );

  return {
    isLoading: state.isLoading,
    fetched: state.fetched,
    permissionKeys: state.permissionKeys,
    hasPermission,
  };
};
