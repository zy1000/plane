import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TCreateReviewTailoringPayload } from "@plane/types";
import { EProductDictionaryKey } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { useStageReviewTemplates } from "@/hooks/store/use-stage-review-templates";

/**
 * 新建裁剪表：标题 + 阶段 + 参与产品。
 *
 * 阶段下拉**只列出已配置评审模板的阶段** —— 选一个空阶段建出来的表是一张没有行的
 * 矩阵，用户只能删了重来。描述留到详情页再补，建表这一步问得越少越好。
 */
export const CreateTailoringModal = observer(function CreateTailoringModal({
  isOpen,
  isSubmitting,
  workspaceSlug,
  projectId,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  workspaceSlug: string;
  projectId: string;
  onClose: () => void;
  onSubmit: (payload: TCreateReviewTailoringPayload) => void;
}) {
  const { t } = useTranslation();
  const { getDictionaryByKey } = useDataDictionaries(workspaceSlug);
  const stageDictionary = getDictionaryByKey(EProductDictionaryKey.STAGE);
  const stages = useMemo(
    () => (stageDictionary?.items ?? []).map((item) => ({ id: item.id, label: item.label })),
    [stageDictionary]
  );
  const { groups, isLoading: isTemplatesLoading } = useStageReviewTemplates(workspaceSlug, stages);
  const { links, isLoading: isProductsLoading } = useProjectProducts({ workspaceSlug, projectId });

  const [title, setTitle] = useState("");
  const [stageId, setStageId] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  /** 空阶段建出来的是一张没有行的矩阵，直接不给选 */
  const stageOptions = useMemo(() => groups.filter((group) => group.nodes.length > 0), [groups]);

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setStageId("");
    setTouched(false);
    // 默认全选：多数情况下一张表覆盖项目的全部产品，取消比逐个勾快
    setSelectedProducts(links.map((link) => link.product));
  }, [isOpen, links]);

  const titleError = touched && !title.trim();
  const stageError = touched && !stageId;
  const productError = touched && selectedProducts.length === 0;
  const isValid = Boolean(title.trim() && stageId && selectedProducts.length > 0);

  const toggleProduct = (productId: string) =>
    setSelectedProducts((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    );

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="p-5">
        <h2 className="text-16 font-semibold text-primary">{t("review_tailoring.form.create_title")}</h2>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-1.5 text-body-sm-medium text-primary">
              {t("review_tailoring.form.title_label")}
              <span className="ml-0.5 text-danger-primary">*</span>
            </p>
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("review_tailoring.form.title_placeholder")}
              className={cn(
                "focus:border-accent-primary h-9 w-full rounded border bg-surface-1 px-2.5 text-13 text-primary outline-none",
                titleError ? "border-danger-primary" : "border-subtle"
              )}
            />
            {titleError && (
              <p className="mt-1 text-11 text-danger-primary">{t("review_tailoring.form.title_required")}</p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-body-sm-medium text-primary">
              {t("review_tailoring.form.stage_label")}
              <span className="ml-0.5 text-danger-primary">*</span>
            </p>
            <select
              value={stageId}
              onChange={(event) => setStageId(event.target.value)}
              disabled={isTemplatesLoading || stageOptions.length === 0}
              className={cn(
                "focus:border-accent-primary h-9 w-full rounded border bg-surface-1 px-2 text-13 text-primary outline-none",
                stageError ? "border-danger-primary" : "border-subtle"
              )}
            >
              <option value="">{t("review_tailoring.form.stage_placeholder")}</option>
              {stageOptions.map((group) => (
                <option key={group.stageId} value={group.stageId}>
                  {group.stageLabel} ({group.reviewCount + group.activityCount})
                </option>
              ))}
            </select>
            <p className="mt-1 text-11 text-tertiary">
              {stageOptions.length === 0 && !isTemplatesLoading
                ? t("review_tailoring.form.stage_empty")
                : t("review_tailoring.form.stage_hint")}
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-body-sm-medium text-primary">
              {t("review_tailoring.form.products_label")}
              <span className="ml-0.5 text-danger-primary">*</span>
            </p>
            {isProductsLoading ? (
              <p className="text-12 text-tertiary">…</p>
            ) : links.length === 0 ? (
              <p className="text-12 text-tertiary">{t("review_tailoring.form.products_empty")}</p>
            ) : (
              <div className="max-h-52 divide-y divide-subtle overflow-y-auto rounded border border-subtle">
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-layer-1">
                  <Checkbox
                    checked={selectedProducts.length === links.length}
                    indeterminate={selectedProducts.length > 0 && selectedProducts.length < links.length}
                    onChange={(event) =>
                      setSelectedProducts(event.target.checked ? links.map((link) => link.product) : [])
                    }
                  />
                  <span className="text-12 font-medium text-primary">{t("review_tailoring.form.select_all")}</span>
                </label>
                {links.map((link) => (
                  <label
                    key={link.product}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-layer-1"
                  >
                    <Checkbox
                      checked={selectedProducts.includes(link.product)}
                      onChange={() => toggleProduct(link.product)}
                    />
                    <span className="min-w-0 flex-1 truncate text-12 text-primary">{link.product_name}</span>
                    {link.product_code && (
                      <span className="shrink-0 text-11 text-tertiary">{link.product_code}</span>
                    )}
                  </label>
                ))}
              </div>
            )}
            {productError && (
              <p className="mt-1 text-11 text-danger-primary">{t("review_tailoring.form.products_required")}</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={isSubmitting}
            disabled={isSubmitting}
            onClick={() => {
              setTouched(true);
              if (!isValid) return;
              onSubmit({ title: title.trim(), stage_id: stageId, product_ids: selectedProducts });
            }}
          >
            {t("create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
