/**
 * 「变更记录」状态分段上的计数。
 *
 * 列表接口没有分状态计数，这里按状态各发一次 per_page=1 的列表请求，只取 total_count。
 * `refreshKey` 变化（列表重新拉取过）时跟着重算，审批/撤回之后计数不会停在旧值。
 */
import { useEffect, useState } from "react";
import type { TRequirementChangeStatus } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

export const CHANGE_STATUS_FILTERS = ["pending", "approved", "rejected"] as const satisfies readonly TRequirementChangeStatus[];

export type TChangeStatusCounts = Partial<Record<"all" | (typeof CHANGE_STATUS_FILTERS)[number], number>>;

export const useChangeRequestStatusCounts = ({
  workspaceSlug,
  productId,
  refreshKey,
}: {
  workspaceSlug: string;
  productId: string;
  refreshKey: unknown;
}) => {
  const [counts, setCounts] = useState<TChangeStatusCounts>({});

  useEffect(() => {
    if (!workspaceSlug || !productId) return;
    let isStale = false;
    const statuses = [undefined, ...CHANGE_STATUS_FILTERS];
    void Promise.all(
      statuses.map((status) =>
        requirementService
          .listChangeRequests(workspaceSlug, productId, { perPage: 1, status })
          .then((response) => response?.total_count ?? 0)
      )
    )
      .then(([all, pending, approved, rejected]) => {
        if (!isStale) setCounts({ all, pending, approved, rejected });
      })
      // 计数只是辅助信息，拿不到就不显示，不打断列表
      .catch(() => {
        if (!isStale) setCounts({});
      });
    return () => {
      isStale = true;
    };
  }, [productId, refreshKey, workspaceSlug]);

  return counts;
};
