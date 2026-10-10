import { useCallback, useEffect, useState } from "react";
import { ReportService, type TReportModule } from "@/services/qa/report.service";

const reportService = new ReportService();

type TArgs = {
  workspaceSlug: string;
  projectId: string;
  /** 权限没拿到或无查看权限时为 false，不发请求 */
  enabled: boolean;
};

/** 把 count 接口的子树累计数覆盖到每个节点的 count 上 */
const applyCounts = (list: TReportModule[], counts: Record<string, number>): TReportModule[] =>
  list.map((m) => ({
    ...m,
    count: counts[m.id] ?? m.count,
    children: m.children?.length ? applyCounts(m.children, counts) : m.children,
  }));

/**
 * 测试报告模块树的数据层：模块列表、子树计数、项目报告总数，以及增 / 改名 / 换父 / 删。
 * 写方法成功后各自重拉整棵树；失败把错误抛给调用方处理（toast）。
 */
export const useReportModules = ({ workspaceSlug, projectId, enabled }: TArgs) => {
  const [modules, setModules] = useState<TReportModule[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(enabled);
  /** 第一次拉取已结束（成功或失败）；空树和「还没加载」要分开，树组件据此校验 URL 带来的选中项 */
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceSlug || !projectId || !enabled) return;
    try {
      setIsLoading(true);
      const [counts, tree] = await Promise.all([
        reportService.getReportModulesCount(workspaceSlug, projectId),
        reportService.getReportModules(workspaceSlug, projectId),
      ]);
      const { total: nextTotal = 0, ...countsMap } = counts || { total: 0 };
      setTotal(Number(nextTotal) || 0);
      setModules(applyCounts(tree, countsMap as Record<string, number>));
    } finally {
      setIsLoading(false);
      setLoaded(true);
    }
  }, [workspaceSlug, projectId, enabled]);

  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);

  const createModule = useCallback(
    async (name: string, parentId: string | null) => {
      await reportService.createReportModule(workspaceSlug, projectId, {
        name,
        ...(parentId ? { parent: parentId } : {}),
      });
      await refresh();
    },
    [workspaceSlug, projectId, refresh]
  );

  const renameModule = useCallback(
    async (moduleId: string, name: string) => {
      await reportService.updateReportModule(workspaceSlug, projectId, moduleId, { name });
      await refresh();
    },
    [workspaceSlug, projectId, refresh]
  );

  const moveModule = useCallback(
    async (moduleId: string, parentId: string | null) => {
      await reportService.updateReportModule(workspaceSlug, projectId, moduleId, { parent: parentId });
      await refresh();
    },
    [workspaceSlug, projectId, refresh]
  );

  const deleteModule = useCallback(
    async (moduleId: string) => {
      await reportService.deleteReportModule(workspaceSlug, projectId, [moduleId]);
      await refresh();
    },
    [workspaceSlug, projectId, refresh]
  );

  return { modules, total, isLoading, loaded, refresh, createModule, renameModule, moveModule, deleteModule };
};
