import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { EIssueLayoutTypes } from "@plane/types";
import type { IProjectView } from "@plane/types";
import { cn } from "@plane/utils";
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";
import { ModeViewBadge } from "./mode-view";

const LAYOUTS = new Set<string>(Object.values(EIssueLayoutTypes));

/** 页签胶囊：选中浅蓝底，未选中只在悬停时有底色 */
export const getViewTabClassName = (isActive: boolean) =>
  cn(
    "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-13 whitespace-nowrap transition-colors focus-visible:outline-none",
    isActive
      ? "bg-accent-subtle font-semibold text-accent-primary"
      : "font-medium text-secondary hover:bg-layer-transparent-hover hover:text-primary"
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
  icon: ReactNode;
  label: string;
  isDirty?: boolean;
  withChevron?: boolean;
  /** 研发模式视图：名字后面带模式小方块 */
  isModeView?: boolean;
};

export const ViewTabContent = ({
  icon,
  label,
  isDirty = false,
  withChevron = false,
  isModeView = false,
}: TViewTabContentProps) => (
  <>
    {icon}
    <span className="max-w-[180px] truncate">{label}</span>
    {isModeView && <ModeViewBadge />}
    {isDirty && <span className="size-[7px] shrink-0 rounded-full bg-warning-primary" aria-label="有未保存的更改" />}
    {withChevron && <ChevronDown className="-ml-0.5 size-3.5 shrink-0" />}
  </>
);
