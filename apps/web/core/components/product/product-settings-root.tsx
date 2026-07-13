import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Package, Trash2, UserPlus, Users } from "lucide-react";
import { NETWORK_CHOICES } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar, Breadcrumbs, CustomSelect, Header, Input } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectNetworkIcon } from "@/components/project/project-network-icon";
import { useProducts } from "@/hooks/store/use-products";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useAppRouter } from "@/hooks/use-app-router";
import type { TProductNetwork, TProductUpdatePayload } from "@/services/product.service";
import { DeleteProductModal } from "./delete-product-modal";
import { ProductDescriptionEditor } from "./product-description-editor";

type TSettingsForm = {
  name: string;
  description_html: string;
  network: TProductNetwork;
  owner: string | null;
};

export const ProductSettingsRoot = observer(function ProductSettingsRoot() {
  const { productId, workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const id = productId?.toString();
  const router = useAppRouter();
  const { deleteProduct, error, fetchProduct, isLoading, isMutating, product, updateProduct } = useProducts(slug);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const {
    addMember,
    eligibleMembers,
    fetchMembers,
    isLoading: isMembersLoading,
    isMutating: isMemberMutating,
    members,
    removeMember,
  } = useProductMembers(slug, id);
  const {
    control,
    formState: { errors, isDirty, isSubmitting },
    handleSubmit,
    reset,
    setError,
  } = useForm<TSettingsForm>({
    defaultValues: { name: "", description_html: "<p></p>", network: 2, owner: null },
  });

  useEffect(() => {
    if (id) void fetchProduct(id).catch(() => undefined);
  }, [fetchProduct, id]);

  useEffect(() => {
    if (id) void fetchMembers().catch(() => undefined);
  }, [fetchMembers, id]);

  useEffect(() => {
    if (!product) return;
    reset({
      name: product.name,
      description_html: product.description_html ?? "<p></p>",
      network: product.network,
      owner: product.owner,
    });
  }, [product, reset]);

  const submitForm = async (data: TSettingsForm) => {
    if (!id || !product?.can_manage) return;
    const payload: TProductUpdatePayload = data;
    try {
      const updated = await updateProduct(id, payload);
      reset({
        name: updated.name,
        description_html: updated.description_html ?? "<p></p>",
        network: updated.network,
        owner: updated.owner,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "保存成功", message: "产品设置已更新。" });
    } catch (err: any) {
      if (Array.isArray(err?.name) && err.name.includes("PRODUCT_NAME_ALREADY_EXIST")) {
        setError("name", { message: "当前工作区已存在同名产品" });
        return;
      }
      setToast({ type: TOAST_TYPE.ERROR, title: "保存失败", message: err?.error ?? "请稍后重试。" });
    }
  };

  const handleDelete = async () => {
    if (!id || !slug) return;
    try {
      await deleteProduct(id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "删除成功", message: "产品及关联数据已进入软删除流程。" });
      router.push(`/${slug}/products`);
    } catch (err: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: err?.error ?? "请稍后重试。" });
    }
  };

  return (
    <>
      {product && (
        <DeleteProductModal
          isOpen={isDeleteModalOpen}
          product={product}
          isDeleting={isMutating}
          onClose={() => setIsDeleteModalOpen(false)}
          onDelete={handleDelete}
        />
      )}
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
                <Breadcrumbs.Item component={<BreadcrumbLink label="设置" />} />
              </Breadcrumbs>
            </Header.LeftItem>
          </Header>
        }
      />
      <ContentWrapper className="p-4 md:p-6">
        <PageHead title={product ? `${product.name} - 产品设置` : "产品设置"} />
        {isLoading ? (
          <div className="mx-auto max-w-4xl animate-pulse space-y-4">
            <div className="h-32 rounded-md bg-layer-1" />
            <div className="h-72 rounded-md bg-layer-1" />
          </div>
        ) : error || !product ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-15 font-medium text-primary">无法打开产品</p>
              <p className="mt-1 text-13 text-secondary">产品不存在，或你没有访问权限。</p>
              <Button variant="secondary" size="lg" className="mt-4" onClick={() => router.push(`/${slug}/products`)}>
                返回产品列表
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(submitForm)} className="mx-auto flex max-w-4xl flex-col gap-6 pb-10">
            <section className="rounded-md border border-subtle bg-surface-1">
              <div className="border-b border-subtle px-5 py-4">
                <h1 className="text-16 font-semibold text-primary">基本信息</h1>
                <p className="mt-1 text-12 text-secondary">
                  {product.can_manage ? "维护产品的负责人、可见范围和描述。" : "你拥有该产品的只读访问权限。"}
                </p>
              </div>
              <div className="space-y-6 p-5">
                <div>
                  <label htmlFor="settings-product-name" className="mb-1.5 block text-13 font-medium text-primary">
                    产品名称
                  </label>
                  <Controller
                    name="name"
                    control={control}
                    rules={{
                      required: "请输入产品名称",
                      maxLength: { value: 255, message: "产品名称不能超过 255 个字符" },
                    }}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="settings-product-name"
                        disabled={!product.can_manage}
                        hasError={!!errors.name}
                        className="h-10 w-full"
                      />
                    )}
                  />
                  {errors.name?.message && <p className="mt-1 text-11 text-danger-primary">{errors.name.message}</p>}
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-13 font-medium text-primary">产品负责人</p>
                    <Controller
                      name="owner"
                      control={control}
                      render={({ field }) => (
                        <MemberDropdown
                          value={field.value}
                          onChange={field.onChange}
                          multiple={false}
                          disabled={!product.can_manage}
                          placeholder="未分配"
                          buttonVariant="border-with-text"
                          buttonClassName="h-10 w-full justify-start"
                        />
                      )}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-13 font-medium text-primary">访问级别</p>
                    <Controller
                      name="network"
                      control={control}
                      render={({ field }) => {
                        const selected = NETWORK_CHOICES.find((choice) => choice.key === field.value);
                        return (
                          <CustomSelect
                            value={field.value}
                            onChange={field.onChange}
                            disabled={!product.can_manage}
                            label={
                              <span className="flex items-center gap-2">
                                {selected && <ProjectNetworkIcon iconKey={selected.iconKey} />}
                                {field.value === 2 ? "公开" : "私密"}
                              </span>
                            }
                            buttonClassName="h-10 w-full"
                          >
                            {NETWORK_CHOICES.map((choice) => (
                              <CustomSelect.Option key={choice.key} value={choice.key}>
                                <span className="flex items-center gap-2">
                                  <ProjectNetworkIcon iconKey={choice.iconKey} />
                                  {choice.key === 2 ? "公开" : "私密"}
                                </span>
                              </CustomSelect.Option>
                            ))}
                          </CustomSelect>
                        );
                      }}
                    />
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-13 font-medium text-primary">产品描述</p>
                  <Controller
                    name="description_html"
                    control={control}
                    render={({ field }) => (
                      <ProductDescriptionEditor
                        workspaceSlug={slug ?? ""}
                        productId={product.id}
                        value={field.value}
                        editable={product.can_manage}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </div>
              {product.can_manage && (
                <div className="flex justify-end border-t border-subtle px-5 py-4">
                  <Button type="submit" variant="primary" size="lg" disabled={!isDirty} loading={isSubmitting}>
                    保存更改
                  </Button>
                </div>
              )}
            </section>

            <section className="rounded-md border border-subtle bg-surface-1">
              <div className="flex flex-col justify-between gap-3 border-b border-subtle px-5 py-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="flex items-center gap-2 text-16 font-semibold text-primary">
                    <Users className="size-4 text-secondary" />
                    产品成员
                  </h2>
                  <p className="mt-1 text-12 text-secondary">
                    私有产品仅产品成员可见；需求负责人和评审人必须具备产品访问权限。
                  </p>
                </div>
                {product.can_manage && (
                  <div className="flex min-w-72 items-center gap-2">
                    <CustomSelect
                      value={selectedMemberId}
                      onChange={setSelectedMemberId}
                      label={
                        eligibleMembers.find((item) => item.id === selectedMemberId)?.display_name ?? "选择工作区成员"
                      }
                      buttonClassName="h-9 min-w-52 flex-1"
                    >
                      {eligibleMembers
                        .filter((item) => !item.is_product_member)
                        .map((item) => (
                          <CustomSelect.Option key={item.id} value={item.id}>
                            {item.display_name}
                          </CustomSelect.Option>
                        ))}
                    </CustomSelect>
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      prependIcon={<UserPlus className="size-4" />}
                      disabled={!selectedMemberId}
                      loading={isMemberMutating}
                      onClick={async () => {
                        try {
                          await addMember(selectedMemberId);
                          setSelectedMemberId("");
                        } catch (err: any) {
                          setToast({
                            type: TOAST_TYPE.ERROR,
                            title: "添加失败",
                            message: err?.error ?? "请稍后重试。",
                          });
                        }
                      }}
                    >
                      添加
                    </Button>
                  </div>
                )}
              </div>
              <div className="divide-y divide-subtle">
                {isMembersLoading ? (
                  <div className="space-y-2 p-5">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="h-10 animate-pulse rounded bg-layer-1" />
                    ))}
                  </div>
                ) : members.length === 0 ? (
                  <p className="px-5 py-8 text-center text-13 text-secondary">暂无显式产品成员。</p>
                ) : (
                  members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar
                          name={member.member_detail.display_name}
                          src={getFileURL(member.member_detail.avatar_url)}
                          size="sm"
                        />
                        <span className="truncate text-13 font-medium text-primary">
                          {member.member_detail.display_name}
                        </span>
                        {member.member === product.owner && (
                          <span className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-10 text-accent-primary">
                            产品负责人
                          </span>
                        )}
                      </div>
                      {product.can_manage && member.member !== product.owner && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isMemberMutating}
                          onClick={async () => {
                            try {
                              await removeMember(member.member);
                            } catch (err: any) {
                              setToast({
                                type: TOAST_TYPE.ERROR,
                                title: "移除失败",
                                message: err?.error ?? "该成员可能仍被需求引用。",
                              });
                            }
                          }}
                        >
                          移除
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            {product.can_manage && (
              <section className="rounded-md border border-danger-subtle bg-surface-1">
                <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-14 font-semibold text-danger-primary">删除产品</h2>
                    <p className="mt-1 text-12 text-secondary">同时软删除该产品下的成员、需求和描述资产。</p>
                  </div>
                  <Button
                    type="button"
                    variant="error-fill"
                    size="lg"
                    prependIcon={<Trash2 className="size-4" />}
                    onClick={() => setIsDeleteModalOpen(true)}
                  >
                    删除产品
                  </Button>
                </div>
              </section>
            )}
          </form>
        )}
      </ContentWrapper>
    </>
  );
});
