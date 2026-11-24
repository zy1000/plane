import { useEffect, useState } from "react";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/**
 * 导入弹窗里「全选 N 条匹配结果」要的那批 id：当前节点下、按关键字命中、且还能导入的全部条目，
 * 不受分页限制。搜索词为空时不发请求。
 *
 * 口径与条目列表一致（同一个列表接口，带 ids_only），所以「列表里能翻到的」和「全选勾上的」是同一批。
 */
export const useImportSearchMatches = ({
  workspaceSlug,
  libraryId,
  moduleId,
  search,
  productId,
}: {
  workspaceSlug: string;
  libraryId: string | null;
  moduleId: string | null;
  search: string;
  productId: string;
}) => {
  const [ids, setIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const keyword = search.trim();

  useEffect(() => {
    setIds([]);
    if (!libraryId || !keyword) {
      setIsLoading(false);
      return;
    }
    let isStale = false;
    setIsLoading(true);
    requirementService
      .listLibraryItemIds(workspaceSlug, libraryId, {
        search: keyword,
        moduleId: moduleId ?? undefined,
        excludeImportedIntoProduct: productId,
      })
      .then((response) => {
        if (!isStale) setIds(response);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!isStale) setIsLoading(false);
      });
    return () => {
      isStale = true;
    };
  }, [keyword, libraryId, moduleId, productId, workspaceSlug]);

  return { ids, isLoading, isActive: Boolean(keyword) };
};
