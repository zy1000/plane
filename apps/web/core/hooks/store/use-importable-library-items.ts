import { useCallback, useEffect, useState } from "react";
import type { TRequirementImportableLibrary } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/**
 * 本产品「还没导过」的标准库条目，按库分组。
 *
 * 导入弹窗的三个数字都从这里来：每个库还剩多少可导（左侧副标题）、勾选框的三态
 * （已选 vs 可导总数）、以及「勾整库」要提交的那批 id。条目列表是游标分页的，
 * 这些都不可能从当前页凑出来。
 *
 * enabled 交给调用方控制 —— 弹窗是常驻挂载的，不设开关就会在每次进产品需求页时
 * 白拉一次全量 id。
 */
export const useImportableLibraryItems = ({
  workspaceSlug,
  productId,
  enabled = true,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
  enabled?: boolean;
}) => {
  const [itemIdsByLibrary, setItemIdsByLibrary] = useState<Map<string, string[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const fetchImportableItems = useCallback(async () => {
    if (!workspaceSlug || !productId) return new Map<string, string[]>();
    setIsLoading(true);
    try {
      const response = await requirementService.listImportableLibraryItems(workspaceSlug, productId);
      const next = new Map(
        response.map((entry: TRequirementImportableLibrary) => [entry.library_id, entry.item_ids])
      );
      setItemIdsByLibrary(next);
      return next;
    } finally {
      setIsLoading(false);
    }
  }, [productId, workspaceSlug]);

  useEffect(() => {
    if (!enabled) return;
    void fetchImportableItems().catch(() => undefined);
  }, [enabled, fetchImportableItems]);

  return { itemIdsByLibrary, isLoading, refetch: fetchImportableItems };
};
