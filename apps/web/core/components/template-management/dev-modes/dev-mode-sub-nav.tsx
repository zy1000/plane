import { Link, useLocation } from "react-router";
import { Layers, ToggleLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { devModeFeaturesPath, devModeStagesPath, isDevModeSubPageActive } from "./routes";
import { DEV_MODE_I18N } from "./dev-modes-grid";

type TSubNavItem = {
  key: string;
  i18nKey: string;
  icon: LucideIcon;
  href: string;
  /** 页签名后面那个小计数 */
  count: string;
  /** 索引页（路径就是详情本身），选中判定只认全等 */
  isIndex: boolean;
};

/**
 * 模式详情的子页页签（阶段 / 组件开关）。
 *
 * 下划线式，与「评审」标签下的子页页签同款。以后模式下面要加内容（里程碑、默认角色
 * 之类），在这里加一项 + 在 `routes.ts` 加一条路径即可，头部与既有子页都不用动。
 */
export function DevModeSubNav({
  workspaceSlug,
  devModeId,
  stageCount,
  featureOnCount,
  featureTotal,
}: {
  workspaceSlug: string;
  devModeId: string;
  stageCount: number;
  featureOnCount: number;
  featureTotal: number;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const items: TSubNavItem[] = [
    {
      key: "stages",
      i18nKey: `${DEV_MODE_I18N}.sub_nav.stages`,
      icon: Layers,
      href: devModeStagesPath(workspaceSlug, devModeId),
      count: String(stageCount),
      isIndex: true,
    },
    {
      key: "features",
      i18nKey: `${DEV_MODE_I18N}.sub_nav.features`,
      icon: ToggleLeft,
      href: devModeFeaturesPath(workspaceSlug, devModeId),
      count: `${featureOnCount} / ${featureTotal}`,
      isIndex: false,
    },
  ];

  return (
    <nav className="flex gap-1 border-b border-subtle px-6">
      {items.map((item) => {
        const isActive = isDevModeSubPageActive(pathname, item.href, item.isIndex);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            to={item.href}
            className={cn(
              "relative mr-4 flex h-10 items-center gap-1.5 whitespace-nowrap px-1 text-13 font-medium transition-colors",
              isActive ? "text-primary" : "text-secondary hover:text-primary"
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span>{t(item.i18nKey)}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-11 font-medium tabular-nums",
                isActive ? "bg-accent-primary/10 text-accent-primary" : "bg-layer-1 text-tertiary"
              )}
            >
              {item.count}
            </span>
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-sm bg-accent-primary" aria-hidden />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
