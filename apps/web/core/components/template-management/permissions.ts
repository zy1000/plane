import {
  WORKSPACE_CASE_TEMPLATE_IMPORT_EXPORT_PERMISSION_KEY,
  WORKSPACE_CASE_TEMPLATE_MANAGE_PERMISSION_KEY,
  WORKSPACE_CASE_TEMPLATE_READ_PERMISSION_KEYS,
  WORKSPACE_REQUIREMENT_LIBRARY_IMPORT_EXPORT_PERMISSION_KEY,
  WORKSPACE_REQUIREMENT_LIBRARY_MANAGE_PERMISSION_KEY,
  WORKSPACE_REQUIREMENT_LIBRARY_READ_PERMISSION_KEYS,
  WORKSPACE_REVIEW_TEMPLATE_MANAGE_PERMISSION_KEY,
  WORKSPACE_REVIEW_TEMPLATE_READ_PERMISSION_KEYS,
} from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";

export type TTemplatePermissions = {
  canViewLibraries: boolean;
  canManageLibraries: boolean;
  canImportExportLibraries: boolean;
  canViewCaseTemplates: boolean;
  canManageCaseTemplates: boolean;
  canImportExportCaseTemplates: boolean;
  canViewReviewTemplates: boolean;
  canManageReviewTemplates: boolean;
  /** 模板中心整体是否可见：三个库任一能看 */
  canAccessTemplates: boolean;
};

/**
 * 模板中心（需求标准库 / 用例模板库 / 评审模板库）的工作区级权限。
 *
 * 后端口径见 plane/app/permissions/keys.py 的 WORKSPACE_REQUIREMENT_LIBRARY_* /
 * WORKSPACE_CASE_TEMPLATE_* / WORKSPACE_REVIEW_TEMPLATE_*：读接受 view 或 manage，
 * 写只认 manage，Excel 另有 import_export（**导入**还要 manage，因为导入本身就是写）。
 * 评审模板库没有导入导出，只有 view / manage 两个 key。
 *
 * 不做 useMemo：allowWorkspacePermissionKeys 读的是 observable，缓存住会让
 * observer 组件在权限变化时收不到通知。
 */
export const useTemplatePermissions = (workspaceSlug: string | undefined): TTemplatePermissions => {
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const slug = workspaceSlug ?? "";

  const canViewLibraries = allowWorkspacePermissionKeys(WORKSPACE_REQUIREMENT_LIBRARY_READ_PERMISSION_KEYS, slug);
  const canViewCaseTemplates = allowWorkspacePermissionKeys(WORKSPACE_CASE_TEMPLATE_READ_PERMISSION_KEYS, slug);
  const canViewReviewTemplates = allowWorkspacePermissionKeys(WORKSPACE_REVIEW_TEMPLATE_READ_PERMISSION_KEYS, slug);

  return {
    canViewLibraries,
    canManageLibraries: allowWorkspacePermissionKeys([WORKSPACE_REQUIREMENT_LIBRARY_MANAGE_PERMISSION_KEY], slug),
    canImportExportLibraries: allowWorkspacePermissionKeys(
      [WORKSPACE_REQUIREMENT_LIBRARY_IMPORT_EXPORT_PERMISSION_KEY],
      slug
    ),
    canViewCaseTemplates,
    canManageCaseTemplates: allowWorkspacePermissionKeys([WORKSPACE_CASE_TEMPLATE_MANAGE_PERMISSION_KEY], slug),
    canImportExportCaseTemplates: allowWorkspacePermissionKeys(
      [WORKSPACE_CASE_TEMPLATE_IMPORT_EXPORT_PERMISSION_KEY],
      slug
    ),
    canViewReviewTemplates,
    canManageReviewTemplates: allowWorkspacePermissionKeys([WORKSPACE_REVIEW_TEMPLATE_MANAGE_PERMISSION_KEY], slug),
    canAccessTemplates: canViewLibraries || canViewCaseTemplates || canViewReviewTemplates,
  };
};
