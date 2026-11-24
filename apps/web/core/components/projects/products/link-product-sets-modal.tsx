import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import type { TProductSet } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { ProductKindIcon } from "@/components/products/sets/product-set-tree";

const I18N = "project_products.sets";
const ROW_GRID = "grid grid-cols-[20px_20px_minmax(0,1fr)_112px_64px_72px] items-center gap-3 px-6";

type TProps = {
  isOpen: boolean;
  /** 工作区里当前用户可见的产品集 */
  productSets: TProductSet[];
  /** 本项目已关联的产品集 id：不再列出 */
  linkedIds: ReadonlySet<string>;
  /** 本项目已关联的产品 id：展开看成员时标出哪些已经关联 */
  linkedProductIds: ReadonlySet<string>;
  isSubmitting: boolean;
  handleClose: () => void;
  onSubmit: (productSetIds: string[]) => void;
};

/** 项目「产品」页的「关联产品集」：关联后，项目的需求、用例来源就可以是这个产品集。 */
/** 展开产品集可以看到它的成员（只读），父子结构与产品管理页的产品集列表一致。 */
export function LinkProductSetsModal({
  isOpen,
  productSets,
  linkedIds,
  linkedProductIds,
  isSubmitting,
  handleClose,
  onSubmit,
}: TProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds([]);
    setExpandedIds([]);
  }, [isOpen]);
  const toggleExpanded = (id: string) =>
    setExpandedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

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
          <span />
          <span>{t("workspace_product_sets.fields.name")}</span>
          <span>{t("workspace_product_sets.fields.identifier")}</span>
          <span className="text-right">{t("workspace_product_sets.fields.products")}</span>
          <span className="text-right">{t("workspace_product_sets.fields.requirements")}</span>
        </div>
        <div className="vertical-scrollbar scrollbar-sm min-h-32 flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="py-12 text-center text-13 text-tertiary">{t(`${I18N}.no_candidates`)}</p>
          ) : (
            candidates.map((productSet) => {
              const isExpanded = expandedIds.includes(productSet.id);
              const members = productSet.products;
              return (
                <Fragment key={productSet.id}>
                  <div
                    className={cn(
                      ROW_GRID,
                      "h-12 border-b text-13 text-primary hover:bg-layer-1-hover",
                      isExpanded && members.length > 0 ? "border-transparent" : "border-subtle"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpanded(productSet.id)}
                      disabled={members.length === 0}
                      aria-expanded={isExpanded}
                      aria-label={t(isExpanded ? "project_requirements.tree.collapse" : "project_requirements.tree.expand")}
                      className="grid size-5 place-items-center rounded text-tertiary hover:text-primary disabled:invisible"
                    >
                      {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    </button>
                    <Checkbox checked={selectedIds.includes(productSet.id)} onChange={() => toggle(productSet.id)} />
                    <button
                      type="button"
                      onClick={() => toggle(productSet.id)}
                      className="flex min-w-0 items-center gap-2 text-left"
                    >
                      <ProductKindIcon isSet />
                      <span className="truncate font-medium">{productSet.name}</span>
                    </button>
                    <span className="truncate font-mono text-12 text-secondary">{productSet.identifier}</span>
                    <span className="text-right tabular-nums">{members.length}</span>
                    <span className="text-right tabular-nums">{productSet.requirement_count}</span>
                  </div>
                  {isExpanded && members.length > 0 && (
                    <div className="mr-6 mb-1.5 ml-[94px] border-b border-subtle pb-1.5">
                      <div className="border-l border-subtle-1">
                        {members.map((member) => (
                          <div
                            key={member.id}
                            className="grid h-9 grid-cols-[minmax(0,1fr)_112px_72px] items-center gap-3 pl-3 text-13 text-secondary"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <ProductKindIcon isSet={false} />
                              <span className="truncate">{member.name}</span>
                            </span>
                            <span className="truncate font-mono text-12 text-tertiary">{member.identifier}</span>
                            <span className="text-right text-12 text-tertiary">
                              {linkedProductIds.has(member.id) ? t(`${I18N}.member_linked`) : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })
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
