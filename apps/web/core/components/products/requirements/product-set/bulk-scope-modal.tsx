import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProductSet, TRequirementBulkScopeMode } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();
const I18N = "workspace_product_sets.requirements";
const MODES: TRequirementBulkScopeMode[] = ["add", "remove", "replace"];

type TProps = {
  workspaceSlug: string;
  productSetId: string;
  /** 勾选的需求；空数组 = 关着 */
  requirementIds: string[];
  members: TProductSet["products"];
  handleClose: () => void;
  onSaved: (requirementIds: string[], scopes: Record<string, string[]>) => void;
};

/** 批量设置使用范围：给勾选的需求加上 / 去掉 / 换成所选产品。 */
export function BulkScopeModal({ workspaceSlug, productSetId, requirementIds, members, handleClose, onSaved }: TProps) {
  const { t } = useTranslation();
  const isOpen = requirementIds.length > 0;
  const [mode, setMode] = useState<TRequirementBulkScopeMode>("add");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode("add");
    // 默认勾满：最常见的用法是「给这些需求加上全部产品」
    setSelectedIds(members.map((member) => member.id));
  }, [isOpen, members]);

  const toggle = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const allSelected = members.length > 0 && selectedIds.length === members.length;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await requirementService.bulkSetRequirementScope(workspaceSlug, productSetId, {
        requirement_ids: requirementIds,
        product_ids: selectedIds,
        mode,
      });
      onSaved(requirementIds, response.scope_product_ids);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: response.skipped.length
          ? t(`${I18N}.bulk_scope_done_skipped`, { count: response.updated, skipped: response.skipped.length })
          : t(`${I18N}.bulk_scope_done`, { count: response.updated }),
      });
      handleClose();
    } catch (requestError) {
      const error = requestError as { error?: string } | null;
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: error?.error ?? t("error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 「覆盖」可以一个都不选（= 清空）；加上 / 去掉至少要选一个
  const canSubmit = mode === "replace" || selectedIds.length > 0;

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => !isSubmitting && handleClose()}
      position={EModalPosition.TOP}
      width={EModalWidth.LG}
    >
      <div className="flex max-h-[min(80vh,36rem)] min-h-0 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-subtle px-5">
          <h2 className="text-16 font-semibold text-primary">{t(`${I18N}.bulk_scope`)}</h2>
          <span className="text-13 text-tertiary">
            {t(`${I18N}.bulk_scope_count`, { count: requirementIds.length })}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="ml-auto grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label={t("close")}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex shrink-0 flex-col gap-2 px-5 pt-4">
          <span className="text-13 font-medium text-secondary">{t(`${I18N}.bulk_scope_mode`)}</span>
          <div className="inline-flex gap-0.5 self-start rounded-lg bg-layer-1 p-[3px]" role="tablist">
            {MODES.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={mode === item}
                onClick={() => setMode(item)}
                className={cn(
                  "h-7 rounded-md px-3 text-13 whitespace-nowrap",
                  mode === item ? "bg-surface-1 font-medium text-primary shadow-sm" : "text-secondary hover:text-primary"
                )}
              >
                {t(`${I18N}.bulk_scope_${item}`)}
              </button>
            ))}
          </div>
          <p className="text-12 text-tertiary">{t(`${I18N}.bulk_scope_${mode}_hint`)}</p>
        </div>
        <div className="flex shrink-0 items-center justify-between px-5 pt-3 pb-1">
          <span className="text-13 font-medium text-secondary">{t(`${I18N}.bulk_scope_products`)}</span>
          {members.length > 0 && (
            <button
              type="button"
              className="text-13 font-medium text-accent-primary hover:underline"
              onClick={() => setSelectedIds(allSelected ? [] : members.map((member) => member.id))}
            >
              {t(allSelected ? `${I18N}.bulk_scope_clear` : `${I18N}.bulk_scope_select_all`)}
            </button>
          )}
        </div>
        <div className="vertical-scrollbar scrollbar-sm min-h-16 flex-1 overflow-y-auto px-2 pb-2">
          {members.length === 0 ? (
            <p className="py-8 text-center text-13 text-tertiary">{t(`${I18N}.scope_no_products`)}</p>
          ) : (
            members.map((member) => (
              <label
                key={member.id}
                className="flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-13 hover:bg-layer-transparent-hover"
              >
                <Checkbox checked={selectedIds.includes(member.id)} onChange={() => toggle(member.id)} />
                <span className="shrink-0 font-medium text-primary tabular-nums">{member.identifier}</span>
                <span className="min-w-0 flex-1 truncate text-secondary">{member.name}</span>
              </label>
            ))
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle px-5 py-3.5">
          <Button variant="secondary" size="lg" type="button" onClick={handleClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            type="button"
            loading={isSubmitting}
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {t("confirm")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
