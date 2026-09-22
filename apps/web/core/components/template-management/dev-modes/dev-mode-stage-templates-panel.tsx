import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TDevModeStage } from "@plane/types";
import { Checkbox, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TDevModeTemplateTreeNode } from "@/hooks/store/use-dev-mode-detail";
import { DEV_MODE_I18N } from "./dev-modes-grid";

const I18N_REVIEWS = "workspace_templates.reviews";

/**
 * 阶段勾选面板：该阶段类型下的评审树（评审 → 活动两层），父节点全选 / 半选。
 *
 * 勾改的是草稿，底栏出现「还原 / 保存勾选」后整体 PUT —— 逐个勾都发一次请求会让
 * 勾父节点变成几十个并发。
 */
export function DevModeStageTemplatesPanel({
  stage,
  tree,
  draftSelection,
  hasChanges,
  isLoading,
  isSaving,
  canEdit,
  onClose,
  onToggle,
  onReset,
  onSave,
}: {
  stage: TDevModeStage;
  tree: TDevModeTemplateTreeNode[];
  draftSelection: Set<string>;
  hasChanges: boolean;
  isLoading: boolean;
  isSaving: boolean;
  canEdit: boolean;
  onClose: () => void;
  onToggle: (templateId: string, checked: boolean) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();

  const totalNodes = tree.reduce((sum, item) => sum + 1 + item.children.length, 0);
  const selectedCount = draftSelection.size;

  return (
    <aside className="flex w-[372px] shrink-0 flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1">
      <div className="flex items-start justify-between gap-2.5 border-b border-subtle px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-13 font-semibold text-primary">
            <span className="shrink-0 font-mono text-12 font-normal tabular-nums text-secondary">{stage.code}</span>
            <span className="truncate">{t(`${DEV_MODE_I18N}.panel.title`, { name: stage.name })}</span>
          </h3>
          <p className="mt-1 text-11 leading-4 text-tertiary">
            {t(`${DEV_MODE_I18N}.panel.description`, { type: stage.stage_type_detail?.name ?? "" })}
          </p>
        </div>
        <button
          type="button"
          className="grid size-7 shrink-0 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-2 hover:text-primary"
          onClick={onClose}
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
        {isLoading ? (
          <Loader className="flex flex-col gap-1.5 p-1">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Loader.Item key={index} height="28px" />
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
              children.length > 0 &&
              selectedChildren > 0 &&
              (selectedChildren < children.length || !isParentChecked);

            return (
              <div key={node.id} className="flex flex-col">
                <label
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-md px-2 text-13 font-semibold text-primary",
                    canEdit ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  <Checkbox
                    disabled={!canEdit}
                    checked={isParentChecked}
                    indeterminate={isIndeterminate && !isParentChecked}
                    onChange={(event) => onToggle(node.id, event.target.checked)}
                  />
                  <span className="min-w-0 flex-1 truncate">{node.title}</span>
                  {children.length > 0 && (
                    <span className="shrink-0 rounded bg-layer-1 px-1.5 py-px text-11 font-medium text-tertiary">
                      {t(`${I18N_REVIEWS}.kind.${node.kind}`)}
                    </span>
                  )}
                  <span className="shrink-0 text-11 font-normal text-tertiary">{node.auditor_role || "—"}</span>
                </label>

                {children.map((child) => (
                  <label
                    key={child.id}
                    className={cn(
                      "relative flex h-9 items-center gap-2.5 rounded-md pl-[34px] pr-2 text-13 transition-colors",
                      canEdit ? "cursor-pointer hover:bg-layer-1-hover" : "cursor-default",
                      draftSelection.has(child.id) ? "text-primary" : "text-tertiary"
                    )}
                  >
                    {/* 连接线：竖线贯穿整行，横线接到复选框。
                        用 border 而不是 bg —— token 体系里只有 --border-color-strong，
                        没有 --background-color-strong，写 bg-strong 画出来是透明的。 */}
                    <span className="pointer-events-none absolute bottom-0 left-[15px] top-0 w-0 border-l border-strong" />
                    <span className="pointer-events-none absolute left-[15px] top-1/2 h-0 w-2.5 border-t border-strong" />
                    <Checkbox
                      disabled={!canEdit}
                      checked={draftSelection.has(child.id)}
                      onChange={(event) => onToggle(child.id, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1 truncate">{child.title}</span>
                    <span className="shrink-0 text-11 text-tertiary">{child.auditor_role || "—"}</span>
                  </label>
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-subtle bg-surface-2 px-3.5 py-2.5">
        <span className="text-12 text-tertiary">
          {t(`${DEV_MODE_I18N}.panel.selected`, { selected: selectedCount, total: totalNodes })}
          {hasChanges && ` · ${t(`${DEV_MODE_I18N}.panel.unsaved`)}`}
        </span>
        {canEdit && hasChanges && (
          <span className="flex gap-1.5">
            <Button variant="tertiary" size="lg" onClick={onReset} disabled={isSaving}>
              {t(`${DEV_MODE_I18N}.panel.reset`)}
            </Button>
            <Button variant="primary" size="lg" onClick={onSave} loading={isSaving}>
              {t(`${DEV_MODE_I18N}.panel.save`)}
            </Button>
          </span>
        )}
      </div>
    </aside>
  );
}
