import { createContext, useContext } from "react";
import { observer } from "mobx-react";
import { useDevModes } from "@/hooks/store/use-dev-modes";
import { useTemplatePermissions } from "./permissions";

type TTemplateCenterContext = {
  workspaceSlug: string;
  /** 研发模式列表：左栏、全部模式对比、模式页的编辑 / 删除共用这一份，改完左栏立刻跟上 */
  modes: ReturnType<typeof useDevModes>;
};

const TemplateCenterContext = createContext<TTemplateCenterContext | undefined>(undefined);

/** 挂在模板中心 layout 上：没有研发模式读权限就不拉（后端同样 403） */
export const TemplateCenterProvider = observer(function TemplateCenterProvider({
  workspaceSlug,
  children,
}: {
  workspaceSlug: string;
  children: React.ReactNode;
}) {
  const { canViewDevModes } = useTemplatePermissions(workspaceSlug);
  const modes = useDevModes(canViewDevModes ? workspaceSlug : undefined);
  return <TemplateCenterContext.Provider value={{ workspaceSlug, modes }}>{children}</TemplateCenterContext.Provider>;
});

export const useTemplateCenter = () => {
  const context = useContext(TemplateCenterContext);
  if (!context) throw new Error("useTemplateCenter must be used within TemplateCenterProvider");
  return context;
};
