import { PERMISSION_KEYS } from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";

/**
 * 风险的增删改查各一把 key（project.risk.*），与后端 views/risk 的装饰器同一口径。
 *
 * 不做 useMemo：权限读的是 observable。
 */
export const useRiskPermissions = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const { allowProjectPermissionKeys } = useUserPermissions();
  const slug = workspaceSlug ?? "";
  const project = projectId ?? "";
  const can = (permissionKey: string) => allowProjectPermissionKeys([permissionKey], slug, project);
  return {
    canView: can(PERMISSION_KEYS.PROJECT_RISK_VIEW),
    canCreate: can(PERMISSION_KEYS.PROJECT_RISK_CREATE),
    canEdit: can(PERMISSION_KEYS.PROJECT_RISK_EDIT),
    canDelete: can(PERMISSION_KEYS.PROJECT_RISK_DELETE),
  };
};
