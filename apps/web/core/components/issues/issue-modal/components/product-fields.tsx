import { useEffect } from "react";
import { observer } from "mobx-react";
import type { Control, UseFormSetValue } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { useTranslation } from "@plane/i18n";
import type { TIssue, TIssueProductLink } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { ProductDropdown } from "@/components/dropdowns/product/dropdown";
import { ProductModuleDropdown } from "@/components/dropdowns/product-module/dropdown";
import { useIsDefectIssueType } from "@/components/issues/issue-detail-widgets/work-item-risks";
// hooks
import { useProjectProduct } from "@/hooks/store/use-project-product";

type TProductLinkDraft = Pick<TIssueProductLink, "product_id" | "product_module_id">;

type Props = {
  control: Control<TIssue>;
  setValue?: UseFormSetValue<TIssue>;
  projectId: string;
  workspaceSlug: string;
  issueTypeId?: string | null;
  /** 编辑已有工作项：缺陷的产品在详情「产品」区块里维护，弹窗里不放 */
  isEdit: boolean;
  getIndex: (key: string) => number;
  handleFormChange: () => void;
};

export const DEFECT_PRODUCT_REQUIRED_MESSAGE = "缺陷须选择至少一个产品";

/**
 * 新建 / 编辑弹窗里的「产品」「产品模块」：
 * - 非缺陷：产品单选、选填，模块跟着产品走（product_id / product_module_id）；
 * - 缺陷：产品多选、必填，每个已选产品各选一个模块，整组写进 products。
 * 新建时切换类型：已选的产品带过去（缺陷 → 非缺陷只留第一个）。
 */
export const IssueProductFields = observer(function IssueProductFields(props: Props) {
  const { control, setValue, projectId, workspaceSlug, issueTypeId, isEdit, getIndex, handleFormChange } = props;
  const { t } = useTranslation();
  const { getProductById } = useProjectProduct();
  const isDefect = useIsDefectIssueType(workspaceSlug, projectId, issueTypeId);
  const watchedProductId = useWatch({ control, name: "product_id" });
  const watchedModuleId = useWatch({ control, name: "product_module_id" });
  const watchedProducts = useWatch({ control, name: "products" });
  // 复制 / 预填时可能只带了列表行上的 product_ids（没有 products 明细）
  const watchedProductIds = useWatch({ control, name: "product_ids" });

  // 新建时：缺陷用整组 products，其余用单值 product_id；类型切换（或预填了 product_id 的缺陷）时把已选产品搬过去
  useEffect(() => {
    if (isEdit || !setValue) return;
    if (isDefect && watchedProducts === undefined) {
      const ids = watchedProductIds?.length ? watchedProductIds : watchedProductId ? [watchedProductId] : [];
      setValue(
        "products",
        ids.map((id) => ({
          product_id: id,
          // 第一个产品的模块在镜像列上；其余产品的模块列表行里没有，留空
          product_module_id: id === watchedProductId ? (watchedModuleId ?? null) : null,
        })),
        { shouldDirty: true }
      );
    } else if (!isDefect && watchedProducts !== undefined) {
      const first = watchedProducts?.[0];
      setValue("product_id", first?.product_id ?? null, { shouldDirty: true });
      setValue("product_module_id", first?.product_module_id ?? null, { shouldDirty: true });
      setValue("products", undefined, { shouldDirty: true });
    }
    // 只在类型分类变化时搬一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDefect, isEdit]);

  if (isDefect && isEdit) return null;

  if (isDefect) {
    return (
      <Controller
        control={control}
        name="products"
        rules={{ validate: (value) => ((value?.length ?? 0) > 0 ? true : DEFECT_PRODUCT_REQUIRED_MESSAGE) }}
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          const links: TProductLinkDraft[] = value ?? [];
          return (
            <>
              <div className="h-7">
                <ProductDropdown
                  multiple
                  projectId={projectId}
                  value={links.map((link) => link.product_id)}
                  onChange={(productIds) => {
                    // 保留仍在的产品各自的模块，新加的产品模块为空
                    const modules = new Map(links.map((link) => [link.product_id, link.product_module_id]));
                    onChange(productIds.map((id) => ({ product_id: id, product_module_id: modules.get(id) ?? null })));
                    handleFormChange();
                  }}
                  placeholder={`${t("product_field.label")} *`}
                  buttonVariant="border-with-text"
                  buttonClassName={cn(error && "border-danger-strong text-danger-primary")}
                  showTooltip
                  tabIndex={getIndex("product_id")}
                />
              </div>
              {links.map((link) => {
                const productName = getProductById(link.product_id)?.name ?? "";
                return (
                  <div key={link.product_id} className="h-7">
                    <ProductModuleDropdown
                      projectId={projectId}
                      productId={link.product_id}
                      value={link.product_module_id ?? null}
                      onChange={(moduleId) => {
                        onChange(
                          links.map((item) =>
                            item.product_id === link.product_id ? { ...item, product_module_id: moduleId } : item
                          )
                        );
                        handleFormChange();
                      }}
                      placeholder={`${productName} ${t("product_module_field.label")}`}
                      buttonVariant="border-with-text"
                      tabIndex={getIndex("product_module_id")}
                    />
                  </div>
                );
              })}
              {error?.message && (
                <span className="flex h-7 items-center text-caption-md-regular text-danger-primary">{error.message}</span>
              )}
            </>
          );
        }}
      />
    );
  }

  return (
    <>
      <Controller
        control={control}
        name="product_id"
        render={({ field: { value, onChange } }) => (
          <div className="h-7">
            <ProductDropdown
              projectId={projectId}
              value={value ?? null}
              onChange={(productId) => {
                onChange(productId);
                // 模块跟着产品走：换产品先清空，避免提交时被服务端拒
                setValue?.("product_module_id", null, { shouldDirty: true });
                handleFormChange();
              }}
              placeholder={t("product_field.label")}
              buttonVariant="border-with-text"
              tabIndex={getIndex("product_id")}
            />
          </div>
        )}
      />
      <Controller
        control={control}
        name="product_module_id"
        render={({ field: { value, onChange } }) => (
          <div className="h-7">
            <ProductModuleDropdown
              projectId={projectId}
              productId={watchedProductId ?? null}
              value={value ?? null}
              onChange={(moduleId) => {
                onChange(moduleId);
                handleFormChange();
              }}
              placeholder={t("product_module_field.label")}
              buttonVariant="border-with-text"
              tabIndex={getIndex("product_module_id")}
            />
          </div>
        )}
      />
    </>
  );
});
