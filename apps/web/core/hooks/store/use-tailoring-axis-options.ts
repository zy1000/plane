import { useEffect, useState } from "react";
import type { TReviewTailoringAxisOption } from "@plane/types";
import { ReviewTailoringService } from "@/services/review-tailoring.service";

const service = new ReviewTailoringService();

/**
 * 「添加评审与产品」弹窗左栏的候选清单。
 *
 * 候选来自服务端按**本项目研发模式**算出来的「阶段 × 节点」，不是整棵评审树：模式里没勾
 * 的节点加不进裁剪表，列出来只会让人白点一次再吃一个 400。
 *
 * 只在弹窗打开时拉一次 —— 模式的配置不会在用户开着弹窗的这几秒里变。
 */
export const useTailoringAxisOptions = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  tailoringId: string | undefined,
  enabled: boolean
) => {
  const [options, setOptions] = useState<TReviewTailoringAxisOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !workspaceSlug || !projectId || !tailoringId) return;
    let cancelled = false;
    setIsLoading(true);
    service
      .listAxisOptions(workspaceSlug, projectId, tailoringId)
      .then((rows) => {
        if (!cancelled) setOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, workspaceSlug, projectId, tailoringId]);

  return { options, isLoading };
};
