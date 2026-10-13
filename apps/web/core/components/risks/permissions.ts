import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";

/**
 * 风险没有细粒度权限 key（2026-10-12 拍板）：项目成员（管理员 / 成员）可读写，访客只读 ——
 * 与后端 views/risk 的 READ_ROLES / WRITE_ROLES 同一口径。
 *
 * 不做 useMemo：allowPermissions 读的是 observable。
 */
export const useRiskPermissions = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const { allowPermissions } = useUserPermissions();
  const slug = workspaceSlug ?? "";
  const project = projectId ?? "";
  return {
    canView: allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
      EUserPermissionsLevel.PROJECT,
      slug,
      project
    ),
    canEdit: allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT, slug, project),
  };
};
