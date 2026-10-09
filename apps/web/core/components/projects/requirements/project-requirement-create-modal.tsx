/**
 * 项目页「提研发需求」：与产品侧「添加需求」同一个弹窗（RequirementCreateModal），多一个必选的所属产品。
 *
 * 保存走 create-in-product 接口：需求建在所选产品下，产品（还没关联时）和需求一并关联进本项目，
 * 三件事在一个事务里。附件、模块、父需求都挂在所选产品上，换产品时弹窗会清掉模块和父需求。
 */
import { useState } from "react";
import { Briefcase, Link2, Package } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProduct, TProjectRequirementCreatePayload } from "@plane/types";
import { RequirementCreateModal } from "@/components/requirements/requirement-create-modal";
import { useRequirementAssetUpload } from "@/components/requirements/use-requirement-asset-upload";
import { ProjectRequirementProductSelect } from "./project-requirement-product-select";

type TProps = {
  workspaceSlug: string;
  projectName?: string;
  /** 当前用户看得见的工作区产品 */
  products: TProduct[];
  isProductsLoading: boolean;
  linkedProductIds: ReadonlySet<string>;
  /** 打开时预选的产品；为空则让用户自己选 */
  defaultProductId: string | null;
  onClose: () => void;
  onSubmit: (payload: TProjectRequirementCreatePayload) => Promise<unknown>;
};

export const ProjectRequirementCreateModal = (props: TProps) => {
  const {
    workspaceSlug,
    projectName,
    products,
    isProductsLoading,
    linkedProductIds,
    defaultProductId,
    onClose,
    onSubmit,
  } = props;
  const { t } = useTranslation();
  const [productId, setProductId] = useState<string | null>(defaultProductId);
  const uploadAsset = useRequirementAssetUpload({ workspaceSlug, entityId: productId ?? "" });

  const product = products.find((item) => item.id === productId) ?? null;
  const productName = product ? product.name || product.identifier : "";
  const isUnlinked = Boolean(product) && !linkedProductIds.has(product?.id ?? "");

  return (
    <RequirementCreateModal
      isOpen
      workspaceSlug={workspaceSlug}
      entityId={productId ?? ""}
      entityKind="product"
      allowTypeSelection
      title={t("project_requirements.create")}
      headerContext={
        projectName ? (
          <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2 text-12 font-medium text-secondary">
            <Briefcase className="size-3.5 shrink-0 text-tertiary" />
            <span className="truncate" title={projectName}>
              {projectName}
            </span>
          </span>
        ) : null
      }
      scopeField={{
        label: t("project_requirements.create_modal.product_label"),
        icon: Package,
        missing: !productId,
        control: (
          <ProjectRequirementProductSelect
            products={products}
            linkedProductIds={linkedProductIds}
            value={productId}
            onChange={setProductId}
            isLoading={isProductsLoading}
          />
        ),
        notice: isUnlinked ? (
          <div className="flex items-start gap-2 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2.5 text-13 leading-5 text-primary">
            <Link2 className="mt-0.5 size-4 shrink-0 text-warning-primary" />
            <span>{t("project_requirements.create_modal.unlinked_notice", { product: productName })}</span>
          </div>
        ) : undefined,
      }}
      footerNote={
        product ? (
          <p className="flex items-center gap-1.5 truncate text-12 text-tertiary">
            <Link2 className="size-3.5 shrink-0" />
            <span className="truncate">
              {t(
                isUnlinked
                  ? "project_requirements.create_modal.footer_note_unlinked"
                  : "project_requirements.create_modal.footer_note",
                { product: productName }
              )}
            </span>
          </p>
        ) : undefined
      }
      onClose={onClose}
      onSave={async (payload) => {
        const [requirement] = payload.creates;
        if (!productId || !requirement) return;
        await onSubmit({ product_id: productId, requirement });
      }}
      onUpload={uploadAsset}
    />
  );
};
