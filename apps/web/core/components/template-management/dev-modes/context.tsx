import { createContext, useContext, useMemo } from "react";
import { useDevModeDetail } from "@/hooks/store/use-dev-mode-detail";

type TDevModeDetailContext = ReturnType<typeof useDevModeDetail> & {
  workspaceSlug: string;
  devModeId: string;
};

const DevModeDetailContext = createContext<TDevModeDetailContext | undefined>(undefined);

/**
 * 模式详情的数据源。
 *
 * 挂在 layout 路由上而不是各个子页里 —— 头部（名称、图标、三个数字）与子页签的计数
 * 在两个子页之间是同一份数据，各页各拉一次会在切页签时闪一下。
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
  const value = useMemo(
    () => ({ ...detail, workspaceSlug, devModeId }),
    [detail, workspaceSlug, devModeId]
  );

  return <DevModeDetailContext.Provider value={value}>{children}</DevModeDetailContext.Provider>;
}

export const useDevModeDetailContext = () => {
  const context = useContext(DevModeDetailContext);
  if (!context) throw new Error("useDevModeDetailContext must be used within DevModeDetailProvider");
  return context;
};
