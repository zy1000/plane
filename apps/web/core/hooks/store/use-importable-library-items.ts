import { useCallback, useEffect, useMemo, useState } from "react";
import type { TRequirementImportableItem, TRequirementImportableLibrary } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/**
 * 本产品「还没导过」的标准库条目，按库分组，每条带所属模块。
 *
 * 导入弹窗左侧那棵「需求类型 → 标准库 → 模块」树的所有数字都从这里来：每个节点还剩
 * 多少可导、勾选框的三态（已选 vs 该节点可导总数）、以及勾节点要提交的那批 id。条目
 * 列表是游标分页的，这些都不可能从当前页凑出来；模块树接口的 count 又是库内全量、
 * 不排除已导入的，所以模块级的可导条数只能靠这里的 module_id 现算。
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
  const [itemsByLibrary, setItemsByLibrary] = useState<Map<string, TRequirementImportableItem[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const fetchImportableItems = useCallback(async () => {
    if (!workspaceSlug || !productId) return new Map<string, TRequirementImportableItem[]>();
    setIsLoading(true);
    try {
      const response = await requirementService.listImportableLibraryItems(workspaceSlug, productId);
      const next = new Map(
        response.map((entry: TRequirementImportableLibrary) => [entry.library_id, entry.items])
      );
      setItemsByLibrary(next);
      return next;
    } finally {
      setIsLoading(false);
    }
  }, [productId, workspaceSlug]);

  useEffect(() => {
    if (!enabled) return;
    void fetchImportableItems().catch(() => undefined);
  }, [enabled, fetchImportableItems]);

  /** 库内顺序的 id 列表 —— 提交时按它排（见 useLibraryImportSelection.toPayloads） */
  const itemIdsByLibrary = useMemo(() => {
    const next = new Map<string, string[]>();
    itemsByLibrary.forEach((items, libraryId) => next.set(libraryId, items.map((item) => item.id)));
    return next;
  }, [itemsByLibrary]);

  return { itemsByLibrary, itemIdsByLibrary, isLoading, refetch: fetchImportableItems };
};
