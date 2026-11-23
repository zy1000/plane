import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirement, TRequirementScopeProduct } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();
const I18N = "workspace_product_sets.requirements";

type TProps = {
  workspaceSlug: string;
  productSetId: string;
  /** 要改使用范围的需求；null = 关着 */
  requirement: TRequirement | null;
  handleClose: () => void;
  /** 保存成功后把新的使用范围回写到列表那一行 */
  onSaved: (requirementId: string, productIds: string[]) => void;
};

/**
 * 产品集需求的「使用范围」：勾选集内哪些产品用这条需求。
 * 已把这条需求转为自有的产品不能再勾（要先删掉自有那条）。
 */
export function RequirementScopeModal({ workspaceSlug, productSetId, requirement, handleClose, onSaved }: TProps) {
  const { t } = useTranslation();
  const requirementId = requirement?.id;
  const [products, setProducts] = useState<TRequirementScopeProduct[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!requirementId) return;
    let cancelled = false;
    setProducts(null);
    requirementService
      .getRequirementScope(workspaceSlug, productSetId, requirementId)
      .then((response) => {
        if (cancelled) return;
        setProducts(response.products);
        setSelectedIds(response.products.filter((product) => product.in_scope).map((product) => product.id));
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productSetId, requirementId, workspaceSlug]);

  const toggle = (productId: string) =>
    setSelectedIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    );

  const handleSubmit = async () => {
    if (!requirementId) return;
    setIsSubmitting(true);
    try {
      const response = await requirementService.setRequirementScope(
        workspaceSlug,
        productSetId,
        requirementId,
        selectedIds
      );
      onSaved(requirementId, response.scope_product_ids ?? selectedIds);
      handleClose();
    } catch (requestError) {
      const error = requestError as { code?: string; error?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: error?.code === "SCOPE_PRODUCT_CONVERTED" ? t(`${I18N}.scope_converted_error`) : (error?.error ?? t("error")),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={Boolean(requirement)}
      handleClose={() => !isSubmitting && handleClose()}
      position={EModalPosition.TOP}
      width={EModalWidth.LG}
    >
      <div className="flex max-h-[min(80vh,36rem)] min-h-0 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-subtle px-5">
          <h2 className="text-16 font-semibold text-primary">{t(`${I18N}.scope`)}</h2>
          {products && products.length > 0 && (
            <span className="text-13 text-tertiary">
              {t(`${I18N}.scope_selected`, { selected: selectedIds.length, total: products.length })}
            </span>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="ml-auto grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label={t("close")}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {requirement && (
          <p className="shrink-0 truncate px-5 pt-3 text-13 text-secondary">
            <span className="mr-2 text-tertiary tabular-nums">{requirement.display_id}</span>
            {requirement.title}
          </p>
        )}
        <div className="vertical-scrollbar scrollbar-sm min-h-24 flex-1 overflow-y-auto p-2">
          {products === null ? (
            <Loader className="space-y-2 p-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Loader.Item key={index} height="36px" />
              ))}
            </Loader>
          ) : products.length === 0 ? (
            <p className="py-10 text-center text-13 text-tertiary">{t(`${I18N}.scope_no_products`)}</p>
          ) : (
            products.map((product) => {
              const isConverted = Boolean(product.converted_display_id);
              return (
                <label
                  key={product.id}
                  className={cn(
                    "flex h-11 items-center gap-2.5 rounded-lg px-3 text-13",
                    isConverted ? "cursor-not-allowed" : "cursor-pointer hover:bg-layer-transparent-hover"
                  )}
                >
                  <Checkbox
                    checked={selectedIds.includes(product.id)}
                    disabled={isConverted}
                    onChange={() => toggle(product.id)}
                  />
                  <span className={cn("shrink-0 font-medium tabular-nums", isConverted ? "text-tertiary" : "text-primary")}>
                    {product.identifier}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate", isConverted ? "text-tertiary" : "text-secondary")}>
                    {product.name}
                  </span>
                  {isConverted && (
                    <span className="inline-flex h-[22px] shrink-0 items-center rounded-md bg-layer-1 px-2 text-12 text-secondary tabular-nums">
                      {t(`${I18N}.scope_converted`, { id: product.converted_display_id ?? "" })}
                    </span>
                  )}
                </label>
              );
            })
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
            disabled={products === null || products.length === 0}
            onClick={() => void handleSubmit()}
          >
            {t("confirm")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
