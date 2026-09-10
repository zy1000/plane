import {
  PROJECT_REVIEW_TAILORING_MANAGE_PERMISSION_KEY,
  PROJECT_REVIEW_TAILORING_READ_PERMISSION_KEYS,
} from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";

export type TReviewTailoringPermissions = {
  canView: boolean;
  canManage: boolean;
};

/**
 * 评审裁剪的项目级权限。读接受 view 或 manage，写只认 manage —— 与后端
 * views/stage_review/tailoring.py 的 TAILORING_READ_KEYS 同一口径。
 *
 * 签批不看 key：能不能签批由「是不是本轮签批人」判定，前端按 approvals 里有没有自己
 * 来决定要不要渲染签批条。
 *
 * 不做 useMemo：allowProjectPermissionKeys 读的是 observable，缓存住会让 observer
 * 组件在权限变化时收不到通知。
 */
export const useReviewTailoringPermissions = (
  workspaceSlug: string | undefined,
  projectId: string | undefined
): TReviewTailoringPermissions => {
  const { allowProjectPermissionKeys } = useUserPermissions();
  const slug = workspaceSlug ?? "";
  const project = projectId ?? "";

  return {
    canView: allowProjectPermissionKeys(PROJECT_REVIEW_TAILORING_READ_PERMISSION_KEYS, slug, project),
    canManage: allowProjectPermissionKeys([PROJECT_REVIEW_TAILORING_MANAGE_PERMISSION_KEY], slug, project),
  };
};
