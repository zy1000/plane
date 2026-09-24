import { PROJECT_STAGE_MANAGE_PERMISSION_KEY, PROJECT_STAGE_READ_PERMISSION_KEYS } from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";

/**
 * 项目阶段的项目级权限。读接受 view 或 manage，写只认 manage —— 与后端
 * views/project_stage.py 的 PROJECT_STAGE_READ_KEYS 同一口径。
 *
 * 不做 useMemo：allowProjectPermissionKeys 读的是 observable。
 */
export const useProjectStagePermissions = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const { allowProjectPermissionKeys } = useUserPermissions();
  const slug = workspaceSlug ?? "";
  const project = projectId ?? "";
  return {
    canView: allowProjectPermissionKeys(PROJECT_STAGE_READ_PERMISSION_KEYS, slug, project),
    canManage: allowProjectPermissionKeys([PROJECT_STAGE_MANAGE_PERMISSION_KEY], slug, project),
  };
};
