import { useContext } from "react";
// mobx store
import { StoreContext } from "@/lib/store-context";
// types
import type { IProjectProductStore } from "@/store/project-product.store";

/** 工作项「产品 / 产品模块」属性用的项目产品池 store（与 SWR 的 useProjectProducts 不是一回事） */
export const useProjectProduct = (): IProjectProductStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useProjectProduct must be used within StoreProvider");
  return context.projectProduct;
};
