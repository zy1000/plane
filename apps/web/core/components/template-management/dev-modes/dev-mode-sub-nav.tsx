import { Link, useLocation } from "react-router";
import { cn } from "@plane/utils";
import { devModeFeaturesPath, devModeIssueSchemePath, devModeStagesPath, isDevModeSubPageActive } from "./routes";

type TSubNavItem = {
  key: string;
  label: string;
  href: string;
  /** 页签名后面的小计数；空串不显示 */
  count: string;
  /** 索引页（路径就是模式页本身），选中判定只认全等 */
  isIndex: boolean;
};

/**
 * 模式页的一层页签（方案 A）：阶段与评审 · 工作项 · 组件。
 *
 * 原来「工作项配置」下面还有一层「类型与属性 / 状态 / 工作流」页签，现在工作项页里改成
 * 「左边选类型、右边分段看属性 / 状态 / 工作流」，页签只剩这一层。
 */
export function DevModeSubNav({
  workspaceSlug,
  devModeId,
  stageCount,
  typeCount,
  featureOnCount,
  featureTotal,
}: {
  workspaceSlug: string;
  devModeId: string;
  stageCount: number;
  /** 还没拉回来时 undefined，不显示计数 */
  typeCount: number | undefined;
  featureOnCount: number;
  featureTotal: number;
}) {
  const { pathname } = useLocation();

  const items: TSubNavItem[] = [
    {
      key: "stages",
      label: "阶段与评审",
      href: devModeStagesPath(workspaceSlug, devModeId),
      count: String(stageCount),
      isIndex: true,
    },
    {
      key: "work_items",
      label: "工作项",
      href: devModeIssueSchemePath(workspaceSlug, devModeId),
      count: typeCount === undefined ? "" : `${typeCount} 类型`,
      isIndex: false,
    },
    {
      key: "features",
      label: "组件",
      href: devModeFeaturesPath(workspaceSlug, devModeId),
      count: `${featureOnCount} / ${featureTotal}`,
      isIndex: false,
    },
  ];

  return (
    <nav className="flex gap-7 border-b border-subtle px-7">
      {items.map((item) => {
        const isActive = isDevModeSubPageActive(pathname, item.href, item.isIndex);
        return (
          <Link
            key={item.key}
            to={item.href}
            className={cn(
              "-mb-px flex h-11 items-center gap-1.5 whitespace-nowrap border-b-2 text-14 transition-colors",
              isActive
                ? "border-accent-primary font-semibold text-primary"
                : "border-transparent text-secondary hover:text-primary"
            )}
          >
            {item.label}
            {item.count && <span className="text-12 font-medium tabular-nums text-tertiary">{item.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
