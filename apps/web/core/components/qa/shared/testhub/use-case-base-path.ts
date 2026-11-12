import { useParams } from "next/navigation";
import { tmCaseBasePath } from "./route-helpers";

/**
 * 当前路由下用例 / 评审页面的根路径（后面接 /cases、/reviews…）。
 * 同一套页面挂在两处：产品入口 /products/:productId/testhub，
 * 项目入口 /projects/:projectId/testhub/products/:productId —— 在哪进来的，跳转就留在哪。
 */
export const useCaseBasePath = (): string => {
  const { workspaceSlug, projectId, productId } = useParams();
  return tmCaseBasePath(String(workspaceSlug || ""), String(productId || ""), projectId ? String(projectId) : undefined);
};
