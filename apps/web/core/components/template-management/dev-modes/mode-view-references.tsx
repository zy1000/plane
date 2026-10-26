import { AlertTriangle, Check } from "lucide-react";
import type { TSchemeView } from "@plane/types";
import { cn } from "@plane/utils";
import { ModeViewBadge } from "@/components/views/in-page/mode-view";
import { ViewLayoutIcon } from "@/components/views/in-page/view-tab-parts";

const PAGE_LABELS: Record<string, string> = { issues: "工作项页", defects: "缺陷页", requirements: "需求页" };

type TModeViewReferencesProps = {
  views: TSchemeView[];
  deleteViews: boolean;
  onDeleteViewsChange: (next: boolean) => void;
};

/**
 * 删类型 / 状态的确认弹窗里：哪些研发模式视图用到了它，要不要一起删。
 * 不勾就保留视图、只从条件里去掉它（后端 prune_mode_view_references）。
 * 弹窗正文包在 <p> 里，这里只用 span / button。
 */
export const ModeViewReferences = ({ views, deleteViews, onDeleteViewsChange }: TModeViewReferencesProps) => {
  if (views.length === 0) return null;
  return (
    <span className="mt-3 flex flex-col gap-2.5 rounded-lg border border-warning-subtle bg-warning-subtle px-3.5 py-3 text-left">
      <span className="flex items-center gap-2 text-13 font-semibold text-warning-primary">
        <AlertTriangle className="size-4 shrink-0" />有 {views.length} 个研发模式视图用到它
      </span>
      <span className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
        {views.map((view) => (
          <span
            key={view.id}
            className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary"
          >
            <ViewLayoutIcon view={view} className="text-tertiary" />
            <span className="min-w-0 truncate font-medium">{view.name}</span>
            <ModeViewBadge />
            <span className="shrink-0 text-12 text-tertiary">{PAGE_LABELS[view.scope ?? "issues"]}</span>
          </span>
        ))}
      </span>
      <button
        type="button"
        role="checkbox"
        aria-checked={deleteViews}
        onClick={() => onDeleteViewsChange(!deleteViews)}
        className="flex w-fit items-center gap-2.5 text-13 text-primary"
      >
        <span
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-sm border",
            deleteViews ? "border-accent-primary bg-accent-primary text-on-color" : "border-strong bg-surface-1"
          )}
        >
          {deleteViews && <Check className="size-3" strokeWidth={3} />}
        </span>
        {views.length === 1 ? "同时删除这个视图" : "同时删除这些视图"}
      </button>
    </span>
  );
};
