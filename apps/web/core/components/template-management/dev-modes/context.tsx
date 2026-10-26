import { createContext, useContext } from "react";
import { useDevModeDetail } from "@/hooks/store/use-dev-mode-detail";
import { useDevModeIssueScheme } from "@/hooks/store/use-dev-mode-issue-scheme";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { useSchemeViews } from "./use-scheme-views";

type TDevModeDetailContext = ReturnType<typeof useDevModeDetail> &
  ReturnType<typeof useDevModeIssueScheme> & {
    workspaceSlug: string;
    devModeId: string;
    /** 模式方案的工作项类型：页签计数与「工作项」页共用一个实例，增删改两边同步 */
    issueTypesStore: ReturnType<typeof useProjectIssueTypes>;
    /** 研发模式视图：「视图」页签、页签计数、删类型 / 状态时的提示共用 */
    schemeViewsStore: ReturnType<typeof useSchemeViews>;
  };

const DevModeDetailContext = createContext<TDevModeDetailContext | undefined>(undefined);

/**
 * 模式页的数据源，挂在 layout 路由上。
 *
 * 头部（名称、三个数字）与页签计数在各子页之间是同一份数据，各页各拉一次会在切页签时闪一下。
 */
export function DevModeDetailProvider({
  children,
  workspaceSlug,
  devModeId,
}: {
  children: React.ReactNode;
  workspaceSlug: string;
  devModeId: string;
}) {
  const detail = useDevModeDetail(workspaceSlug, devModeId);
  const issueScheme = useDevModeIssueScheme(workspaceSlug, detail.devMode?.issue_scheme);
  const issueTypesStore = useProjectIssueTypes(workspaceSlug, issueScheme.scopeKey);
  const schemeViewsStore = useSchemeViews(workspaceSlug, detail.devMode?.issue_scheme);

  // 这些 hook 每次渲染都回新对象，useMemo 拦不住，直接拼
  const value: TDevModeDetailContext = {
    ...detail,
    ...issueScheme,
    workspaceSlug,
    devModeId,
    issueTypesStore,
    schemeViewsStore,
  };

  return <DevModeDetailContext.Provider value={value}>{children}</DevModeDetailContext.Provider>;
}

/** 不在模式页里时返回 undefined：给项目设置与模板中心共用的组件（如删状态）判断自己在哪 */
export const useOptionalDevModeDetailContext = () => useContext(DevModeDetailContext);

export const useDevModeDetailContext = () => {
  const context = useContext(DevModeDetailContext);
  if (!context) throw new Error("useDevModeDetailContext must be used within DevModeDetailProvider");
  return context;
};
