import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import type { TProductSet } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

const I18N = "project_products.sets";
const ROW_GRID = "grid grid-cols-[20px_minmax(0,1fr)_112px_88px] items-center gap-3 px-6";

type TProps = {
  isOpen: boolean;
  /** 工作区里当前用户可见的产品集 */
  productSets: TProductSet[];
  /** 本项目已关联的产品集 id：不再列出 */
  linkedIds: ReadonlySet<string>;
  isSubmitting: boolean;
  handleClose: () => void;
  onSubmit: (productSetIds: string[]) => void;
};

/** 项目「产品」页的「关联产品集」：关联后，项目的需求、用例来源就可以是这个产品集。 */
export function LinkProductSetsModal({ isOpen, productSets, linkedIds, isSubmitting, handleClose, onSubmit }: TProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) setSelectedIds([]);
  }, [isOpen]);

  const candidates = productSets.filter((productSet) => !linkedIds.has(productSet.id));
  const toggle = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => !isSubmitting && handleClose()}
      position={EModalPosition.TOP}
      width={EModalWidth.XL}
    >
      <div className="flex max-h-[min(80vh,36rem)] min-h-0 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between px-6">
          <h2 className="text-16 font-semibold text-primary">{t(`${I18N}.link`)}</h2>
          <button
            type="button"
            onClick={handleClose}
            className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label={t("close")}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className={cn(ROW_GRID, "h-9 shrink-0 border-y border-subtle bg-layer-1 text-12 font-medium text-secondary")}>
          <span />
          <span>{t("workspace_product_sets.fields.name")}</span>
          <span>{t("workspace_product_sets.fields.identifier")}</span>
          <span className="text-right">{t("workspace_product_sets.fields.requirements")}</span>
        </div>
        <div className="vertical-scrollbar scrollbar-sm min-h-32 flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="py-12 text-center text-13 text-tertiary">{t(`${I18N}.no_candidates`)}</p>
          ) : (
            candidates.map((productSet) => (
              <label
                key={productSet.id}
                className={cn(
                  ROW_GRID,
                  "h-11 cursor-pointer border-b border-subtle text-13 text-primary last:border-b-0 hover:bg-layer-1-hover"
                )}
              >
                <Checkbox checked={selectedIds.includes(productSet.id)} onChange={() => toggle(productSet.id)} />
                <span className="truncate font-medium">{productSet.name}</span>
                <span className="truncate text-secondary tabular-nums">{productSet.identifier}</span>
                <span className="text-right tabular-nums">{productSet.requirement_count}</span>
              </label>
            ))
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle px-6 py-4">
          <Button variant="secondary" size="lg" type="button" onClick={handleClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            type="button"
            loading={isSubmitting}
            disabled={selectedIds.length === 0}
            onClick={() => onSubmit(selectedIds)}
          >
            {t(`${I18N}.link_action`)}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
