"use client";

import React from "react";
import { Modal, Form, Input, message } from "antd";
import { Button } from "@plane/propel/button";
import {
  ProductCategoryModulesPreview,
  ProductCategoryReadonly,
  ProductCategorySelect,
} from "@/components/template-management/libraries/product-category-select";
import { useProductCategories } from "@/hooks/store/use-product-categories";
import { RepositoryService } from "@/services/qa/repository.service";
import { WorkspaceService } from "@/services/workspace.service";

type Props = {
  open: boolean;
  workspaceSlug: string;
  initialValues?: {
    id?: string;
    name?: string;
    description?: string;
    /** 模板库：所选产品模板（创建后不可改，编辑时只读） */
    product_category_detail?: { id: string; name: string } | null;
  } | null;
  /** 用例库所属产品（2026-11 起用例库归产品）；模板库模式不传 */
  productId?: string;
  /** 模板库模式：创建时固定 is_template=true、product=null */
  templateMode?: boolean;
  onCancel: () => void;
  onSuccess: () => void;
};

export const RepositoryModal: React.FC<Props> = ({
  open,
  workspaceSlug,
  initialValues,
  productId,
  templateMode = false,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = React.useState(false);
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const isCreate = !initialValues?.id;
  const [productCategoryId, setProductCategoryId] = React.useState<string | null>(null);
  const [productCategoryError, setProductCategoryError] = React.useState<string | null>(null);
  // 只在模板库的创建弹窗打开时拉；产品用例库 / 编辑传 undefined，不发请求
  const { categories: productCategories, isLoading: isProductCategoriesLoading } = useProductCategories(
    templateMode && open && isCreate ? workspaceSlug : undefined
  );
  const selectedProductCategory = productCategories.find((category) => category.id === productCategoryId) ?? null;

  const repositoryService = React.useMemo(() => new RepositoryService(), []);
  const workspaceService = React.useMemo(() => new WorkspaceService(), []);

  React.useEffect(() => {
    if (!workspaceSlug) return;
    const init = async () => {
      try {
        const ws = await workspaceService.getWorkspace(workspaceSlug);
        setWorkspaceId(ws?.id || null);
      } catch {
        setWorkspaceId(null);
      }
    };
    init();
  }, [workspaceSlug, workspaceService]);

  React.useEffect(() => {
    if (!open) return;
    setProductCategoryId(null);
    setProductCategoryError(null);
    if (!initialValues) {
      form.resetFields();
    } else {
      form.setFieldsValue({
        name: initialValues.name ?? "",
        description: initialValues.description ?? "",
      });
    }
  }, [open, initialValues, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload: any = {
        name: values.name,
        description: values.description || "",
        workspace: workspaceId,
      };
      // 产品在创建时决定，编辑不改挂
      if (!initialValues?.id) payload.product = templateMode ? null : productId || null;
      if (templateMode) payload.is_template = true;
      if (templateMode && isCreate) payload.product_category_id = productCategoryId;

      const entityLabel = templateMode ? "模板库" : "用例库";
      if (initialValues?.id) {
        await repositoryService.updateRepository(String(workspaceSlug), { id: initialValues.id, ...payload });
        message.success(`${entityLabel}已更新`);
      } else {
        await repositoryService.createRepository(String(workspaceSlug), payload);
        message.success(`${entityLabel}已创建`);
      }
      onSuccess();
      onCancel();
    } catch (e: any) {
      const fieldError = templateMode ? e?.product_category_id?.[0] : undefined;
      if (fieldError) {
        setProductCategoryError(String(fieldError));
        return;
      }
      const msg = e?.message || e?.detail || e?.error || "提交失败";
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <Button variant="secondary" size="lg" onClick={onCancel}>
        取消
      </Button>
      <Button variant="primary" size="lg" onClick={handleSubmit} loading={submitting}>
        {initialValues?.id ? "更新" : "创建"}
      </Button>
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={
        templateMode
          ? initialValues?.id
            ? "编辑模板库"
            : "新建模板库"
          : initialValues?.id
            ? "编辑用例库"
            : "新增用例库"
      }
      footer={footer}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label={templateMode ? "模板库名称" : "用例库名称"}
          rules={[{ required: true, message: templateMode ? "请输入模板库名称" : "请输入用例库名称" }]}
        >
          <Input placeholder="请输入名称" maxLength={255} />
        </Form.Item>
        {templateMode && (
          <Form.Item
            label="产品模板"
            validateStatus={productCategoryError ? "error" : undefined}
            help={productCategoryError ?? undefined}
            extra={
              isCreate && selectedProductCategory ? (
                <div className="mt-2">
                  <ProductCategoryModulesPreview category={selectedProductCategory} />
                </div>
              ) : undefined
            }
          >
            {isCreate ? (
              <ProductCategorySelect
                categories={productCategories}
                value={productCategoryId}
                onChange={(next) => {
                  setProductCategoryId(next);
                  setProductCategoryError(null);
                }}
                disabled={isProductCategoriesLoading}
                hasError={Boolean(productCategoryError)}
                optionsClassName="z-[1100]"
              />
            ) : (
              <ProductCategoryReadonly category={initialValues?.product_category_detail ?? null} />
            )}
          </Form.Item>
        )}
        <Form.Item name="description" label="描述">
          <Input.TextArea placeholder="可填写简单描述" autoSize={{ minRows: 3, maxRows: 6 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RepositoryModal;
