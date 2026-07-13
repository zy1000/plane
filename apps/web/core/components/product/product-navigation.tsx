import type { ElementType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarRange,
  ClipboardList,
  Code2,
  FolderKanban,
  Grid3X3,
  LayoutDashboard,
  Map,
  Package,
  Rocket,
  Settings,
} from "lucide-react";
import { observer } from "mobx-react";
import { TabNavigationItem, TabNavigationList } from "@plane/propel/tab-navigation";
import { Tooltip } from "@plane/propel/tooltip";
import { Header, Row } from "@plane/ui";
import { cn } from "@plane/utils";
import { useAppTheme } from "@/hooks/store/use-app-theme";

export type TProductViewKey =
  | "dashboard"
  | "user-requirements"
  | "development-requirements"
  | "plans"
  | "matrix"
  | "projects"
  | "releases"
  | "roadmap"
  | "activity"
  | "settings";

export type TProductNavigationItem = {
  key: TProductViewKey;
  label: string;
  icon: ElementType;
  placeholderDescription: string;
};

export const PRODUCT_NAVIGATION_ITEMS: TProductNavigationItem[] = [
  {
    key: "dashboard",
    label: "仪表盘",
    icon: LayoutDashboard,
    placeholderDescription: "产品进展、关键指标和交付状态将在这里汇总展示。",
  },
  {
    key: "user-requirements",
    label: "用户需求",
    icon: ClipboardList,
    placeholderDescription: "来自用户的需求和反馈将在这里统一管理。",
  },
  {
    key: "development-requirements",
    label: "研发需求",
    icon: Code2,
    placeholderDescription: "研发需求的拆解、评审和流转将在这里进行。",
  },
  {
    key: "plans",
    label: "计划",
    icon: CalendarRange,
    placeholderDescription: "产品计划和阶段目标将在这里组织。",
  },
  {
    key: "matrix",
    label: "矩阵",
    icon: Grid3X3,
    placeholderDescription: "需求、项目与交付之间的关联将在这里呈现。",
  },
  {
    key: "projects",
    label: "项目",
    icon: FolderKanban,
    placeholderDescription: "与当前产品关联的项目将在这里管理。",
  },
  {
    key: "releases",
    label: "发布",
    icon: Rocket,
    placeholderDescription: "产品版本和发布记录将在这里管理。",
  },
  {
    key: "roadmap",
    label: "路线图",
    icon: Map,
    placeholderDescription: "产品方向、里程碑和长期规划将在这里展示。",
  },
  {
    key: "activity",
    label: "动态",
    icon: Activity,
    placeholderDescription: "产品内的重要变更和协作记录将在这里汇总。",
  },
  {
    key: "settings",
    label: "设置",
    icon: Settings,
    placeholderDescription: "产品基础信息和访问权限将在这里配置。",
  },
];

const PRODUCT_TAB_ITEMS = PRODUCT_NAVIGATION_ITEMS.filter((item) => item.key !== "settings");

type TProductNavigationProps = {
  workspaceSlug: string;
  productId: string;
  productName?: string;
  isLoading?: boolean;
};

export const ProductNavigation = observer(function ProductNavigation(props: TProductNavigationProps) {
  const { workspaceSlug, productId, productName, isLoading = false } = props;
  const pathname = usePathname();
  const { sidebarCollapsed } = useAppTheme();

  const productsHref = `/${workspaceSlug}/products`;
  const settingsHref = `/${workspaceSlug}/products/${productId}/settings`;
  const isSettingsActive = pathname === settingsHref || pathname?.startsWith(`${settingsHref}/`);

  return (
    <div className="z-20">
      <Row className="flex h-header w-full items-center gap-2 border-b border-subtle bg-surface-1">
        <div className="flex h-full w-full items-center gap-2 divide-x divide-subtle">
          <div className="flex size-full flex-1 items-center gap-2">
            <Header className={cn("h-full", { "pl-1.5": !sidebarCollapsed })}>
              <Header.LeftItem className="flex h-full max-w-full items-center gap-2">
                <div className="flex size-full items-center gap-3 overflow-hidden">
                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={productsHref} className="cursor-pointer text-13 font-medium text-primary">
                      产品管理
                    </Link>
                    <div className="mx-2 h-5 w-1 shrink-0 border-l border-subtle" />
                    <div className="flex max-w-48 items-center gap-1.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-layer-1">
                        <Package className="size-4 text-secondary" />
                      </span>
                      {isLoading ? (
                        <span className="h-4 w-24 animate-pulse rounded bg-layer-2" />
                      ) : (
                        <p className="truncate text-14 font-medium text-secondary" title={productName}>
                          {productName ?? "产品"}
                        </p>
                      )}
                    </div>
                    <Tooltip tooltipContent="产品设置" position="bottom">
                      <Link
                        href={settingsHref}
                        className={cn(
                          "ml-1 flex size-6 flex-shrink-0 items-center justify-center rounded text-tertiary transition-colors hover:bg-surface-2 hover:text-secondary",
                          isSettingsActive && "bg-surface-2 text-secondary"
                        )}
                        aria-label="产品设置"
                      >
                        <Settings className="size-3.5" />
                      </Link>
                    </Tooltip>
                  </div>

                  <div className="h-5 w-1 shrink-0 border-l border-subtle" />

                  <nav aria-label="产品子菜单" className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
                    <TabNavigationList className="h-full">
                      {PRODUCT_TAB_ITEMS.map((item) => {
                        const href = `/${workspaceSlug}/products/${productId}/${item.key}`;
                        const isActive = pathname === href || pathname === `${href}/`;

                        return (
                          <div key={item.key} className="relative flex h-full items-center">
                            {isActive && (
                              <span className="absolute -bottom-px left-1/2 h-0.5 w-[80%] -translate-x-1/2 rounded-t-md bg-(--text-color-icon-primary)" />
                            )}
                            <Link href={href} aria-current={isActive ? "page" : undefined}>
                              <TabNavigationItem isActive={isActive}>
                                <span>{item.label}</span>
                              </TabNavigationItem>
                            </Link>
                          </div>
                        );
                      })}
                    </TabNavigationList>
                  </nav>
                </div>
              </Header.LeftItem>
            </Header>
          </div>
        </div>
      </Row>
    </div>
  );
});
