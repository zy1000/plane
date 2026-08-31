import { useEffect, useState } from "react";
import type { TRequirementLibraryConfiguration } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/**
 * 单个标准库的配置：库信息、类型字段与内置列布局。
 *
 * 条目整页只要这一份就能渲染字段 —— 不像列表页那样连同第一页条目一起拉
 * （那是 useLibraryItems 的事，深链进整页时白拉一页行没有意义）。
 */
export const useLibraryConfiguration = ({
  workspaceSlug,
  libraryId,
}: {
  workspaceSlug: string | undefined;
  libraryId: string | undefined;
}) => {
  const [configuration, setConfiguration] = useState<TRequirementLibraryConfiguration | null>(null);

  useEffect(() => {
    setConfiguration(null);
    if (!workspaceSlug || !libraryId) return;
    let cancelled = false;
    requirementService
      .getLibraryConfiguration(workspaceSlug, libraryId)
      .then((response) => {
        if (!cancelled) setConfiguration(response);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [libraryId, workspaceSlug]);

  return configuration;
};
