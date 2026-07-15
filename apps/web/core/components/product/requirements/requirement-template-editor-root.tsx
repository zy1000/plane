import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useOutletContext } from "react-router";
import { AlertTriangle, Eye, FileSliders, Package, RotateCcw, Trash2 } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Breadcrumbs, Header, Input, TextArea, ToggleSwitch } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import type { TProductDetailOutletContext } from "@/components/product/product-detail-layout";
import { useRequirementTemplates } from "@/hooks/store/use-requirement-templates";
import useReloadConfirmations from "@/hooks/use-reload-confirmation";
import { useAppRouter } from "@/hooks/use-app-router";
import { useUserPermissions } from "@/hooks/store/user";
import type { TRequirementTemplatePayload, TStructuredField } from "@/services/requirement-structure.service";
import { RequirementStructuredSchemaBuilder } from "./requirement-structured-schema-builder";
import { RequirementTemplatePreview } from "./requirement-template-preview";

type TTemplateForm = {
  name: string;
  description: string;
  isActive: boolean;
  fields: TStructuredField[];
};

const emptyForm: TTemplateForm = {
  name: "",
  description: "",
  isActive: true,
  fields: [],
};

type Props = {
  isNew?: boolean;
};

export function RequirementTemplateEditorRoot(props: Props) {
  const { isNew = false } = props;
  const { productId, templateId, workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const id = productId?.toString();
  const currentTemplateId = templateId?.toString();
  const router = useAppRouter();
  const { error: productError, isLoading: isProductLoading, product } = useOutletContext<TProductDetailOutletContext>();
  const { allowPermissions } = useUserPermissions();
  const {
    createTemplate,
    deleteTemplate,
    error,
    fetchTemplate,
    isDirty,
    isLoading,
    isMutating,
    markDirty,
    resetDirty,
    template,
    updateTemplate,
  } = useRequirementTemplates(slug, id);
  const [form, setForm] = useState<TTemplateForm>(emptyForm);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const listPath = slug && id ? `/${slug}/products/${id}/requirement-templates` : "#";

  const canManage = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const isReadOnly = !canManage;
  const { setShowAlert } = useReloadConfirmations(true, "当前模板有尚未保存的修改，确定离开吗？", false, resetDirty);

  useEffect(() => setShowAlert(isDirty), [isDirty, setShowAlert]);

  useEffect(() => {
    if (isNew) {
      setForm(emptyForm);
      resetDirty();
      return;
    }
    if (!currentTemplateId) return;
    void fetchTemplate(currentTemplateId)
      .then((response) => {
        setForm({
          name: response.name,
          description: response.description,
          isActive: response.is_active,
          fields: response.fields,
        });
        setHasConflict(false);
      })
      .catch(() => undefined);
  }, [currentTemplateId, fetchTemplate, isNew, resetDirty]);

  const updateForm = (patch: Partial<TTemplateForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    markDirty();
    setHasConflict(false);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      setToast({ type: TOAST_TYPE.ERROR, title: "无法保存", message: "请输入模板名称。" });
      return;
    }
    const payload: TRequirementTemplatePayload = {
      name,
      description: form.description.trim(),
      template_type: "structured",
      is_active: form.isActive,
      fields: form.fields,
    };
    try {
      if (isNew) {
        const created = await createTemplate(payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "需求模板已创建", message: "字段方案已保存。" });
        router.replace(`${listPath}/${created.id}`);
      } else if (currentTemplateId && template) {
        const updated = await updateTemplate(currentTemplateId, template.revision, payload);
        setForm({
          name: updated.name,
          description: updated.description,
          isActive: updated.is_active,
          fields: updated.fields,
        });
        setToast({ type: TOAST_TYPE.SUCCESS, title: "需求模板已保存", message: `当前修订为 R${updated.revision}。` });
      }
      setHasConflict(false);
    } catch (mutationError: any) {
      if (mutationError?.code === "REQUIREMENT_TEMPLATE_STALE") {
        setHasConflict(true);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "模板已被其他人更新",
          message: "请重新加载服务器版本后再继续编辑。",
        });
        return;
      }
      const duplicateName = Array.isArray(mutationError?.name)
        ? mutationError.name.includes("REQUIREMENT_TEMPLATE_NAME_EXISTS")
        : false;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "保存失败",
        message: duplicateName ? "当前产品中已经存在同名模板。" : (mutationError?.error ?? "请检查字段配置后重试。"),
      });
    }
  };

  const reload = async () => {
    if (!currentTemplateId) return;
    const response = await fetchTemplate(currentTemplateId);
    setForm({
      name: response.name,
      description: response.description,
      isActive: response.is_active,
      fields: response.fields,
    });
    setHasConflict(false);
  };

  const goToList = () => {
    if (isDirty && !window.confirm("当前模板有尚未保存的修改，确定离开吗？")) return;
    resetDirty();
    router.push(listPath);
  };

  if (isNew && !canManage) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-15 font-medium text-primary">没有创建需求模板的权限</p>
          <p className="mt-1 text-13 text-secondary">访客可以查看和使用模板，但不能创建或修改。</p>
          <Button variant="secondary" size="lg" className="mt-4" onClick={goToList}>
            返回需求模板
          </Button>
        </div>
      </div>
    );
  }

  const pageTitle = isNew ? "创建需求模板" : (template?.name ?? "需求模板");

  const activeFields = form.fields.filter((field) => field.is_active !== false);
  const rootFields = activeFields.filter((field) => !field.parent_key);
  const rootFieldCount = rootFields.length;
  const tableFieldCount = rootFields.filter((field) => field.field_type === "table").length;
  const hasAutoId = activeFields.some((field) => field.field_type === "auto_id");

  return (
    <>
      <AlertModalCore
        isOpen={isDeleteOpen}
        title="删除需求模板"
        content={`删除“${template?.name ?? ""}”后将无法继续用于新需求，已经导入该模板的需求不会受到影响。`}
        isSubmitting={isMutating}
        handleClose={() => setIsDeleteOpen(false)}
        handleSubmit={async () => {
          if (!currentTemplateId) return;
          try {
            await deleteTemplate(currentTemplateId);
            resetDirty();
            setIsDeleteOpen(false);
            setToast({ type: TOAST_TYPE.SUCCESS, title: "模板已删除", message: "已有需求数据未受影响。" });
            router.push(listPath);
          } catch (mutationError: any) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: "删除失败",
              message: mutationError?.error ?? "请稍后重试。",
            });
          }
        }}
      />

      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label="产品管理"
                      href={slug ? `/${slug}/products` : undefined}
                      icon={<Package className="size-4 text-tertiary" />}
                    />
                  }
                />
                {product && <Breadcrumbs.Item component={<BreadcrumbLink label={product.name} />} />}
                <Breadcrumbs.Item component={<BreadcrumbLink label="需求模板" href={listPath} />} />
                <Breadcrumbs.Item component={<BreadcrumbLink label={pageTitle} />} />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem>
              {isDirty && <span className="text-11 text-warning-primary">尚未保存</span>}
              {!isNew && template && (
                <span
                  className={`rounded-full px-2 py-1 text-11 font-medium ${
                    form.isActive ? "bg-success-subtle text-success-primary" : "bg-layer-2 text-secondary"
                  }`}
                >
                  {form.isActive ? "已启用" : "已停用"} · R{template.revision}
                </span>
              )}
              {!isNew && canManage && (
                <Button variant="secondary" size="lg" onClick={() => setIsDeleteOpen(true)}>
                  <Trash2 className="size-4 text-danger-primary" />
                </Button>
              )}
              {canManage && (
                <Button
                  variant="primary"
                  size="lg"
                  loading={isMutating}
                  disabled={!isDirty}
                  onClick={() => void save()}
                >
                  {isNew ? "创建模板" : "保存模板"}
                </Button>
              )}
            </Header.RightItem>
          </Header>
        }
      />

      <ContentWrapper>
        <PageHead title={product ? `${product.name} - ${pageTitle}` : pageTitle} />
        {isProductLoading || (!isNew && isLoading) ? (
          <div className="mx-auto w-full max-w-[1180px] px-5 py-6 lg:px-8">
            <div className="grid animate-pulse gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <div className="h-44 rounded-xl bg-layer-1" />
                <div className="h-72 rounded-xl bg-layer-1" />
              </div>
              <div className="space-y-4">
                <div className="h-40 rounded-xl bg-layer-1" />
                <div className="h-64 rounded-xl bg-layer-1" />
              </div>
            </div>
          </div>
        ) : productError || !product || (!isNew && (error || !template)) ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-15 font-medium text-primary">无法打开需求模板</p>
              <p className="mt-1 text-13 text-secondary">模板不存在，或你没有访问权限。</p>
              <Button variant="secondary" size="lg" className="mt-4" onClick={goToList}>
                返回需求模板
              </Button>
            </div>
          </div>
        ) : (
          <div className="vertical-scrollbar h-full overflow-y-auto bg-surface-1">
            <div className="mx-auto w-full max-w-[1180px] px-5 py-6 lg:px-8">
              {hasConflict && (
                <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-warning-strong bg-warning-subtle px-4 py-3">
                  <AlertTriangle className="size-4 shrink-0 text-warning-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-12 font-medium text-primary">服务器上的模板已经更新</p>
                    <p className="mt-0.5 text-11 text-secondary">重新加载会放弃当前本地修改。</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    prependIcon={<RotateCcw className="size-3.5" />}
                    onClick={() => void reload()}
                  >
                    重新加载
                  </Button>
                </div>
              )}

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
                <div className="min-w-0 space-y-6">
                  <section className="rounded-xl border border-subtle bg-surface-1 p-5">
                    <div className="mb-4 flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-primary/10 text-accent-primary">
                        <FileSliders className="size-4" />
                      </span>
                      <div>
                        <h1 className="text-15 font-semibold text-primary">模板信息</h1>
                        <p className="mt-0.5 text-12 text-secondary">用于识别模板并控制它是否出现在新建需求中。</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label
                          htmlFor="requirement-template-name"
                          className="mb-1.5 block text-12 font-medium text-primary"
                        >
                          模板名称
                        </label>
                        <Input
                          id="requirement-template-name"
                          value={form.name}
                          disabled={isReadOnly}
                          onChange={(event) => updateForm({ name: event.target.value })}
                          placeholder="例如：电源规格需求模板"
                          className="h-9"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-layer-1/50 px-3.5 py-3">
                        <div className="min-w-0">
                          <p className="text-12 font-medium text-primary">模板状态</p>
                          <p className="mt-0.5 text-11 text-secondary">
                            {form.isActive
                              ? "启用后，新建结构化需求时可以导入该模板。"
                              : "停用后仅保留查看和编辑，不会出现在新建需求中。"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-11 font-medium text-secondary">{form.isActive ? "启用" : "停用"}</span>
                          <ToggleSwitch
                            value={form.isActive}
                            disabled={isReadOnly}
                            onChange={(value) => updateForm({ isActive: value })}
                            size="md"
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="requirement-template-description"
                          className="mb-1.5 block text-12 font-medium text-primary"
                        >
                          模板描述
                        </label>
                        <TextArea
                          id="requirement-template-description"
                          value={form.description}
                          disabled={isReadOnly}
                          onChange={(event) => updateForm({ description: event.target.value })}
                          placeholder="说明模板适用的研发需求场景"
                          rows={3}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-subtle bg-surface-1 p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-15 font-semibold text-primary">需求字段</h2>
                        <p className="mt-0.5 text-12 text-secondary">
                          定义结构化需求的数据列。模板导入需求后将成为独立副本，后续修改互不影响。
                        </p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-layer-1 px-2.5 py-1 text-11 font-medium text-secondary">
                        {rootFieldCount} 个字段
                      </span>
                    </div>
                    <RequirementStructuredSchemaBuilder
                      fields={form.fields}
                      readOnly={isReadOnly}
                      onChange={(fields) => updateForm({ fields })}
                    />
                  </section>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-6">
                  <section className="rounded-xl border border-subtle bg-surface-1 p-4">
                    <h3 className="text-12 font-semibold text-primary">模板概要</h3>
                    <dl className="mt-3 space-y-2.5 text-12">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-secondary">状态</dt>
                        <dd>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-11 font-medium ${
                              form.isActive ? "bg-success-subtle text-success-primary" : "bg-layer-2 text-secondary"
                            }`}
                          >
                            <span
                              className={`size-1.5 rounded-full ${
                                form.isActive ? "bg-success-primary" : "bg-placeholder"
                              }`}
                            />
                            {form.isActive ? "已启用" : "已停用"}
                          </span>
                        </dd>
                      </div>
                      {!isNew && template && (
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-secondary">修订</dt>
                          <dd className="font-medium text-primary">R{template.revision}</dd>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-secondary">顶级字段</dt>
                        <dd className="font-medium text-primary tabular-nums">{rootFieldCount}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-secondary">子表</dt>
                        <dd className="font-medium text-primary tabular-nums">{tableFieldCount}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-secondary">自动编号</dt>
                        <dd className="font-medium text-primary">{hasAutoId ? "已启用" : "无"}</dd>
                      </div>
                      {!isNew && template && (
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-secondary">更新时间</dt>
                          <dd className="text-secondary">{renderFormattedDate(template.updated_at)}</dd>
                        </div>
                      )}
                    </dl>
                  </section>

                  <section className="rounded-xl border border-subtle bg-surface-1 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Eye className="size-3.5 text-tertiary" />
                      <h3 className="text-12 font-semibold text-primary">录入预览</h3>
                    </div>
                    <RequirementTemplatePreview fields={form.fields} />
                  </section>
                </aside>
              </div>
            </div>
          </div>
        )}
      </ContentWrapper>
    </>
  );
}
