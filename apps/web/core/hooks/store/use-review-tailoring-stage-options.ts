import { useEffect, useState } from "react";
import type { TReviewTailoringStageOption } from "@plane/types";
import { ReviewTailoringService } from "@/services/review-tailoring.service";

const service = new ReviewTailoringService();

/**
 * 新建 O阶段评审裁剪时可绑定的阶段。`enabled` 为真才拉（弹窗打开且选了 O 类型），
 * 每次重新启用都重拉 —— 用户可能刚去阶段页加了一个回来。`options` 为 null 表示还没拉到。
 */
export const useReviewTailoringStageOptions = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  enabled: boolean
) => {
  const [options, setOptions] = useState<TReviewTailoringStageOption[] | null>(null);

  useEffect(() => {
    if (!enabled || !workspaceSlug || !projectId) return;
    let cancelled = false;
    setOptions(null);
    void service
      .stageOptions(workspaceSlug, projectId)
      .then((next) => {
        if (!cancelled) setOptions(next);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, workspaceSlug, projectId]);

  return options;
};
