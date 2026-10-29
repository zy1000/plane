import { useContext } from "react";
// mobx store
import { StoreContext } from "@/lib/store-context";
// types
import type { IProjectStageStore } from "@/store/project-stage.store";

/** 迭代 / 工作项「阶段」属性用的项目阶段池 store（阶段页自己的 useProjectStages 是组件内 state，不是一回事） */
export const useProjectStage = (): IProjectStageStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useProjectStage must be used within StoreProvider");
  return context.projectStage;
};
