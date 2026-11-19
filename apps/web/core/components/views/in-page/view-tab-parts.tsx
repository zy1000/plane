import { ChevronDown } from "lucide-react";
import { ViewsIcon } from "@plane/propel/icons";
import { EIssueLayoutTypes } from "@plane/types";
import type { IProjectView } from "@plane/types";
import { cn } from "@plane/utils";
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";
import { ModeViewBadge } from "./mode-view";

const LAYOUTS = new Set<string>(Object.values(EIssueLayoutTypes));

/** 页签胶囊：选中浅蓝底，未选中只在悬停时有底色（项目列表快捷筛选在用） */
export const getViewTabClassName = (isActive: boolean) =>
  cn(
    "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-13 whitespace-nowrap transition-colors focus-visible:outline-none",
    isActive
      ? "bg-accent-subtle font-semibold text-accent-primary"
      : "font-medium text-secondary hover:bg-layer-transparent-hover hover:text-primary"
  );

/** 视图页签：贴在栏底线上，选中是深色字 + 主色下划线，未选中只有次要色文字 */
export const getViewUnderlineTabClassName = (isActive: boolean) =>
  cn(
    "relative flex h-12 shrink-0 items-center gap-1.5 px-2.5 text-14 whitespace-nowrap transition-colors focus-visible:outline-none",
    "after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-t-sm",
    isActive
      ? "font-semibold text-primary after:bg-accent-primary"
      : "font-medium text-secondary hover:text-primary hover:after:bg-layer-3"
  );

/** 视图前的图标取它记住的布局；没有布局的（需求页）用列表图标 */
export const ViewLayoutIcon = ({ view, className }: { view: IProjectView; className?: string }) => {
  const layout = view.display_filters?.layout;
  return (
    <IssueLayoutIcon
      layout={layout && LAYOUTS.has(layout) ? layout : EIssueLayoutTypes.LIST}
      size={14}
      strokeWidth={2}
      className={cn("size-3.5 shrink-0", className)}
    />
  );
};

type TViewTabContentProps = {
  label: string;
  isDirty?: boolean;
  withChevron?: boolean;
  /** 研发模式视图：名字后面带模式小方块 */
  isModeView?: boolean;
};

/** 名字前统一放「视图」图标（不按布局区分），颜色跟文字走 */
export const ViewTabContent = ({ label, isDirty = false, withChevron = false, isModeView = false }: TViewTabContentProps) => (
  <>
    <ViewsIcon className="size-3.5 shrink-0" />
    <span className="max-w-[180px] truncate">{label}</span>
    {isModeView && <ModeViewBadge />}
    {isDirty && <span className="size-[7px] shrink-0 rounded-full bg-warning-primary" aria-label="有未保存的更改" />}
    {withChevron && <ChevronDown className="-ml-0.5 size-3.5 shrink-0 text-tertiary" />}
  </>
);
