import {
  PROJECT_STAGE_REVIEW_MANAGE_PERMISSION_KEY,
  PROJECT_STAGE_REVIEW_READ_PERMISSION_KEYS,
} from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";

export type TStageReviewPermissions = {
  canView: boolean;
  canManage: boolean;
};

/**
 * 阶段评审的项目级权限。读接受 view 或 manage，写只认 manage —— 与后端
 * views/stage_review/review.py 的 STAGE_REVIEW_READ_KEYS 同一口径。
 *
 * 推进状态没有单独的 key：四步都归 manage，谁该推进由负责人 / 审核者两个字段表达。
 *
 * 不做 useMemo：allowProjectPermissionKeys 读的是 observable，缓存住会让 observer
 * 组件在权限变化时收不到通知。
 */
export const useStageReviewPermissions = (
  workspaceSlug: string | undefined,
  projectId: string | undefined
): TStageReviewPermissions => {
  const { allowProjectPermissionKeys } = useUserPermissions();
  const slug = workspaceSlug ?? "";
  const project = projectId ?? "";

  return {
    canView: allowProjectPermissionKeys(PROJECT_STAGE_REVIEW_READ_PERMISSION_KEYS, slug, project),
    canManage: allowProjectPermissionKeys([PROJECT_STAGE_REVIEW_MANAGE_PERMISSION_KEY], slug, project),
  };
};
