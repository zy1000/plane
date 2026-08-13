import { useMemo, useState } from "react";
import type { TProductRelease, TReleaseStatus } from "@plane/types";
import { normalizeReleaseStatusValue } from "@/components/releases/release-status-config";

export type TProductReleaseStatusFilter = "all" | TReleaseStatus;

/**
 * 产品发布聚合列表的客户端筛选。
 *
 * 列表是全量返回（无后端分页），四个维度全部在客户端过滤。状态 tab 的计数基于
 * 「除状态外其他筛选已生效」的集合——这样点某个 tab 只切换列表内容，不会让 tab
 * 自己的数字坍缩成 0。
 */
export const useProductReleaseFilters = (releases: TProductRelease[]) => {
  const [statusFilter, setStatusFilter] = useState<TProductReleaseStatusFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [onlyThisProduct, setOnlyThisProduct] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 只筛「有发布单的项目」：从数据本身派生，免掉一次项目列表请求
  const projectOptions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const release of releases) {
      if (!seen.has(release.project_id)) {
        seen.set(release.project_id, {
          id: release.project_id,
          name: release.project_detail?.name ?? release.project_id,
        });
      }
    }
    return [...seen.values()];
  }, [releases]);

  const baseFiltered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return releases.filter((release) => {
      if (projectFilter && release.project_id !== projectFilter) return false;
      if (onlyThisProduct && release.product_requirement_count === 0) return false;
      if (query && !release.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [releases, projectFilter, onlyThisProduct, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<TProductReleaseStatusFilter, number>> = { all: baseFiltered.length };
    for (const release of baseFiltered) {
      const status = normalizeReleaseStatusValue(release.status);
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }, [baseFiltered]);

  const filteredReleases = useMemo(() => {
    if (statusFilter === "all") return baseFiltered;
    return baseFiltered.filter((release) => normalizeReleaseStatusValue(release.status) === statusFilter);
  }, [baseFiltered, statusFilter]);

  return {
    statusFilter,
    setStatusFilter,
    projectFilter,
    setProjectFilter,
    onlyThisProduct,
    setOnlyThisProduct,
    searchQuery,
    setSearchQuery,
    projectOptions,
    statusCounts,
    filteredReleases,
  };
};
