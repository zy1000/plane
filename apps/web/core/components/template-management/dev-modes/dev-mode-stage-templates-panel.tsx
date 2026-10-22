import { Link } from "react-router";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { EStageReviewKind, TDevModeStage } from "@plane/types";
import { Checkbox, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TDevModeTemplateTreeNode } from "@/hooks/store/use-dev-mode-detail";
import { StageReviewKindBadge } from "../reviews/stage-review-kind-badge";
import { reviewTemplatesPath } from "./routes";
import { DEV_MODE_I18N } from "./dev-modes-grid";

/**
 * 选中阶段的评审节点（方案 A，常驻右栏）：评审 → 活动两层树，父节点全选 / 半选。
 *
 * 勾改的是草稿，底栏出现「还原 / 保存勾选」后整体 PUT —— 逐个勾都发一次请求会让
 * 勾父节点变成几十个并发。
 */
export function DevModeStageTemplatesPanel({
  workspaceSlug,
  stage,
  tree,
  draftSelection,
  hasChanges,
  isLoading,
  isSaving,
  canEdit,
  onToggle,
  onReset,
  onSave,
}: {
  workspaceSlug: string;
  stage: TDevModeStage;
  tree: TDevModeTemplateTreeNode[];
  draftSelection: Set<string>;
  hasChanges: boolean;
  isLoading: boolean;
  isSaving: boolean;
  canEdit: boolean;
  onToggle: (templateId: string, checked: boolean) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();

  const totalNodes = tree.reduce((sum, item) => sum + 1 + item.children.length, 0);
  const selectedCount = draftSelection.size;
  const percent = totalNodes ? Math.round((selectedCount / totalNodes) * 100) : 0;

  return (
    <aside className="flex w-[384px] shrink-0 flex-col border-l border-subtle bg-surface-1">
      <div className="border-b border-subtle px-5 pb-3.5 pt-[18px]">
        <h3 className="flex items-center gap-2 text-16 font-semibold text-primary">
          <span className="truncate">{stage.name}</span>
          <span className="shrink-0 font-mono text-12 font-normal text-tertiary">{stage.code}</span>
        </h3>
        <p className="mt-1 text-12 text-tertiary">项目进入此阶段时，按这里的勾选生成评审与评审活动</p>
        <div className="mt-3.5 flex items-center gap-2.5 text-12 text-secondary">
          <span className="shrink-0">
            已勾选 <b className="tabular-nums text-primary">{selectedCount}</b> / {totalNodes}
          </span>
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-layer-3">
            <span className="block h-full rounded-full bg-accent-primary" style={{ width: `${percent}%` }} />
          </span>
          {/* 这棵树只能在评审模板库维护，这里只勾选 —— 给一条直达该阶段类型的路 */}
          <Link
            to={reviewTemplatesPath(workspaceSlug, stage.stage_type_id)}
            className="flex shrink-0 items-center gap-1 text-link-primary hover:text-link-primary-hover"
          >
            评审模板库
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>

      <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 py-2">
        {isLoading ? (
          <Loader className="flex flex-col gap-1.5 p-1">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Loader.Item key={index} height="44px" />
            ))}
          </Loader>
        ) : tree.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-4 py-10 text-center">
            <p className="text-12 leading-5 text-placeholder">{t(`${DEV_MODE_I18N}.panel.empty`)}</p>
          </div>
        ) : (
          tree.map(({ node, children }) => {
            const selectedChildren = children.filter((child) => draftSelection.has(child.id)).length;
            const isParentChecked = draftSelection.has(node.id);
            // 半选：自己勾了但子节点没勾满，或者自己没勾但有子节点勾了
            const isIndeterminate =
              children.length > 0 && selectedChildren > 0 && (selectedChildren < children.length || !isParentChecked);

            return (
              <div key={node.id} className="flex flex-col">
                <label
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-layer-transparent-hover",
                    canEdit ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  {children.length > 0 ? (
                    <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-tertiary" />
                  ) : null}
                  <span className="pt-px">
                    <Checkbox
                      disabled={!canEdit}
                      checked={isParentChecked}
                      indeterminate={isIndeterminate && !isParentChecked}
                      onChange={(event) => onToggle(node.id, event.target.checked)}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("truncate text-13", children.length > 0 ? "font-semibold text-primary" : "text-primary")}>
                        {node.title}
                      </span>
                      {children.length > 0 && <StageReviewKindBadge kind={node.kind as EStageReviewKind} className="shrink-0" />}
                    </span>
                    <span className="mt-0.5 block truncate text-12 text-tertiary">
                      {children.length > 0
                        ? `主导 ${node.leader_role || "—"}`
                        : [node.leader_role, node.auditor_role].filter(Boolean).join(" → ") || "—"}
                    </span>
                  </span>
                </label>

                {children.length > 0 && (
                  <div className="ml-[22px] border-l border-subtle pl-1">
                    {children.map((child) => {
                      const isChecked = draftSelection.has(child.id);
                      return (
                        <label
                          key={child.id}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-layer-transparent-hover",
                            canEdit ? "cursor-pointer" : "cursor-default"
                          )}
                        >
                          <span className="pt-px">
                            <Checkbox
                              disabled={!canEdit}
                              checked={isChecked}
                              onChange={(event) => onToggle(child.id, event.target.checked)}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-13", isChecked ? "text-primary" : "text-tertiary")} title={child.title}>
                              {child.title}
                            </span>
                            <span className="mt-0.5 block truncate text-12 text-tertiary">
                              {[child.leader_role, child.auditor_role].filter(Boolean).join(" → ") || "—"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-subtle bg-layer-1 px-4 py-3">
        {hasChanges ? (
          <>
            <span className="size-[7px] rounded-full bg-warning-primary" />
            <span className="text-13 text-secondary">{t(`${DEV_MODE_I18N}.panel.unsaved`)}</span>
            {canEdit && (
              <span className="ml-auto flex gap-1.5">
                <Button variant="tertiary" size="lg" onClick={onReset} disabled={isSaving}>
                  {t(`${DEV_MODE_I18N}.panel.reset`)}
                </Button>
                <Button variant="primary" size="lg" onClick={onSave} loading={isSaving}>
                  {t(`${DEV_MODE_I18N}.panel.save`)}
                </Button>
              </span>
            )}
          </>
        ) : (
          <span className="text-12 text-tertiary">勾选后在这里保存</span>
        )}
      </div>
    </aside>
  );
}
