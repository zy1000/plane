import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EFileAssetType, EUserWorkspaceRoles } from "@plane/types";
import type { TLogoProps, TProductNetwork } from "@plane/types";
import { Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { IdentifierInput, isValidIdentifier } from "@/components/common/identifier-input";
import { RichTextEditor } from "@/components/editor/rich-text";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PageHead } from "@/components/core/page-title";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { handleCoverImageChange } from "@/helpers/cover-image.helper";
import { useProductEditorAssets } from "@/hooks/use-product-editor-assets";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WorkspaceService } from "@/services/workspace.service";
import { useProductsContext } from "../context";
import { DeleteProductModal } from "../delete-modal";
import { ProductExtendedFields, useProductExtendedFields } from "../extended-fields";
import { ProductLogoCoverHeader } from "../logo-cover-header";
import { ProductSettingsHeader } from "./header";

const workspaceService = new WorkspaceService();
const EMPTY_DESCRIPTION = "<p></p>";

export const ProductGeneralSettings = observer(function ProductGeneralSettings() {
  const { workspaceSlug, productId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { workspaceInfoBySlug, hasAllWorkspacePermissions } = useUserPermissions();
  const { getWorkspaceBySlug } = useWorkspace();
  const { products, updateProduct, setProductToDelete } = useProductsContext();
  const product = products.find(({ id }) => id === productId);
  const workspaceId = workspaceSlug ? getWorkspaceBySlug(workspaceSlug)?.id?.toString() : undefined;
  const { members: productMembers } = useProductMembers(workspaceSlug, productId);

  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [descriptionHTML, setDescriptionHTML] = useState(EMPTY_DESCRIPTION);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [network, setNetwork] = useState<TProductNetwork>(2);
  const [logoProps, setLogoProps] = useState<TLogoProps | undefined>(undefined);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const extended = useProductExtendedFields({ product, mode: "edit" });

  const { cleanupSessionAssets, commitAssets, handleDeferredAssetDelete, handleDuplicate, handleUpload, resetAssets } =
    useProductEditorAssets({
      entityId: productId ?? "product",
      workspaceSlug: workspaceSlug ?? "",
    });

  const workspaceInfo = workspaceSlug ? workspaceInfoBySlug(workspaceSlug) : undefined;
  const hasWorkspaceAdminAccess = Boolean(
    workspaceSlug && (workspaceInfo?.role === EUserWorkspaceRoles.ADMIN || hasAllWorkspacePermissions(workspaceSlug))
  );
  const isPrivateProduct = network === 0;
  const isProductMember = Boolean(
    currentUser?.id && productMembers.some((membership) => membership.member === currentUser.id)
  );
  const willLosePrivateAccess = Boolean(
    isPrivateProduct &&
    ownerId &&
    ownerId !== currentUser?.id &&
    !isProductMember &&
    !hasWorkspaceAdminAccess
  );

  // 负责人只能从产品成员里选。成员还在加载时先兜住当前负责人，否则下拉会短暂空掉。
  const ownerCandidateIds = useMemo(() => {
    const ids = productMembers.map((membership) => membership.member);
    if (product?.owner && !ids.includes(product.owner)) ids.unshift(product.owner);
    return ids;
  }, [product?.owner, productMembers]);

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setIdentifier(product.identifier);
    setDescriptionHTML(product.description_html?.trim() ? product.description_html : EMPTY_DESCRIPTION);
    setOwnerId(product.owner);
    setNetwork(product.network);
    extended.reset(product);
    // 老产品可能没有 logo/封面：不注入随机默认，展示层用 PackageOpen/默认封面兜底
    setLogoProps(product.logo_props?.in_use ? product.logo_props : undefined);
    setCoverImageUrl(product.cover_image_url ?? null);
    setFormError(null);
    setIdentifierError(null);
    setOwnerError(null);
    resetAssets();
    setEditorVersion((version) => version + 1);
  }, [extended.reset, product?.id, product?.updated_at, resetAssets]);

  useEffect(
    () => () => {
      void cleanupSessionAssets();
    },
    [cleanupSessionAssets]
  );

  if (!workspaceSlug || !productId || !product) return null;

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError(t("workspace_products.settings.validation.name_required"));
      return;
    }
    if (!isValidIdentifier(identifier)) {
      setIdentifierError(t("common.identifier.invalid"));
      return;
    }
    if (!ownerId) {
      setOwnerError(t("workspace_products.validation.owner_required"));
      return;
    }
    if (!extended.validate()) return;

    setIsSaving(true);
    setFormError(null);
    setIdentifierError(null);
    setOwnerError(null);
    extended.clearErrors();
    try {
      // 换封面：静态图/上传在资产确认时由后端直接回写绑定，外链才进 PATCH payload
      const coverPayload = await handleCoverImageChange(product.cover_image_url, coverImageUrl, {
        workspaceSlug,
        entityIdentifier: product.id,
        entityType: EFileAssetType.PRODUCT_COVER,
      });
      const savedProduct = await updateProduct(product.id, {
        name: trimmedName,
        identifier,
        description_html: descriptionHTML,
        network,
        owner: ownerId,
        ...(logoProps ? { logo_props: logoProps } : {}),
        ...(coverPayload ?? {}),
        ...extended.getPayload(),
      });
      await commitAssets(descriptionHTML);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.toast.updated"),
      });

      const canStillManage = hasWorkspaceAdminAccess || savedProduct.owner === currentUser?.id;
      if (!canStillManage) {
        const canStillView = savedProduct.network === 2 || isProductMember;
        navigate(canStillView ? `/${workspaceSlug}/products/${productId}/requirements` : `/${workspaceSlug}/products`, {
          replace: true,
        });
      }
    } catch (error) {
      const errorPayload =
        error && typeof error === "object"
          ? (error as { name?: string[]; identifier?: string[]; owner?: string[] })
          : {};
      if (errorPayload.owner?.[0])
        setOwnerError(
          errorPayload.owner[0] === "PRODUCT_OWNER_NOT_MEMBER"
            ? t("workspace_products.validation.owner_not_member")
            : String(errorPayload.owner[0])
        );
      // 后端返回 PRODUCT_IDENTIFIER_ALREADY_EXISTS / _INVALID 两种错误码
      else if (errorPayload.identifier?.[0])
        setIdentifierError(
          errorPayload.identifier[0] === "PRODUCT_IDENTIFIER_ALREADY_EXISTS"
            ? t("common.identifier.already_exists")
            : t("common.identifier.invalid")
        );
      else if (extended.applyServerErrors(error)) {
        // 字段级错误已在扩展字段区行内展示
      } else setFormError(String(errorPayload.name?.[0] ?? t("workspace_products.toast.failed")));
    } finally {
      setIsSaving(false);
    }
  };

  const createdAt = renderFormattedDate(product.created_at);

  return (
    <SettingsContentWrapper header={<ProductSettingsHeader settingsKey="general" />}>
      <PageHead title={`${t("workspace_products.settings.navigation.general")} - ${product.name}`} />

      <div className="w-full">
        <div className="mb-8">
          <ProductLogoCoverHeader
            coverImageUrl={coverImageUrl}
            logoProps={logoProps}
            editable
            entityIdentifier={product.id}
            onCoverChange={setCoverImageUrl}
            onLogoChange={setLogoProps}
          />
        </div>
        <div className="space-y-8">
          <div className="space-y-4">
            <div>
              <label htmlFor="product-settings-name" className="mb-1.5 block text-body-sm-medium text-primary">
                {t("workspace_products.settings.fields.name")}
                <span className="ml-0.5 text-danger-primary">*</span>
              </label>
              <input
                id="product-settings-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setFormError(null);
                }}
                maxLength={255}
                className="focus:border-accent-primary h-10 w-full rounded-md border border-subtle bg-surface-1 px-3 text-body-sm-regular text-primary outline-none placeholder:text-placeholder"
                placeholder={t("workspace_products.fields.name")}
              />
              {formError && <p className="mt-1.5 text-caption-md-regular text-danger-primary">{formError}</p>}
            </div>

            {/* 改标识符只影响展示：编号是读时拼的，所有已有需求的编号会立刻跟着变 */}
            <IdentifierInput
              id="product-settings-identifier"
              value={identifier}
              onChange={(value) => {
                setIdentifier(value);
                setIdentifierError(null);
              }}
              error={identifierError}
              label={t("workspace_products.fields.identifier")}
              hint={t("workspace_products.settings.fields.identifier_hint")}
              labelClassName="text-body-sm-medium text-primary"
              inputClassName="h-10"
            />

            <div>
              <p className="mb-1.5 text-body-sm-medium text-primary">
                {t("workspace_products.settings.fields.description")}
              </p>
              {!workspaceId ? (
                <Loader>
                  <Loader.Item height="120px" />
                </Loader>
              ) : (
                <div className="min-h-[120px] overflow-hidden rounded-md border border-subtle bg-surface-1">
                  <RichTextEditor
                    key={`product-settings-editor-${product.id}-${editorVersion}`}
                    id={product.id}
                    editable
                    initialValue={descriptionHTML}
                    value={null}
                    workspaceSlug={workspaceSlug}
                    workspaceId={workspaceId}
                    dragDropEnabled
                    deferAssetDeletion
                    onDeferredAssetDelete={handleDeferredAssetDelete}
                    onChange={(_json, html) => setDescriptionHTML(html)}
                    placeholder={t("workspace_products.fields.description")}
                    searchMentionCallback={(payload) => workspaceService.searchEntity(workspaceSlug, payload)}
                    uploadFile={handleUpload}
                    duplicateFile={handleDuplicate}
                    containerClassName="min-h-[120px] pr-3 pt-3 text-13"
                  />
                </div>
              )}
            </div>
          </div>

          <ProductExtendedFields
            workspaceSlug={workspaceSlug}
            editable
            variant="settings"
            product={product}
            values={extended.values}
            errors={extended.errors}
            onChange={extended.setValue}
            missingRequiredFields={extended.missingRequiredFields}
            ownerField={
              <div className="min-w-0">
                <span className="mb-1.5 block text-body-sm-medium text-primary">
                  {t("workspace_products.fields.product_owner")}
                  <span className="ml-0.5 text-danger-primary">*</span>
                </span>
                <div className="h-10 w-full">
                  <MemberDropdown
                    multiple={false}
                    value={ownerId}
                    memberIds={ownerCandidateIds}
                    onChange={(value) => {
                      setOwnerId(value);
                      setOwnerError(null);
                    }}
                    buttonVariant="border-with-text"
                    className="h-full w-full"
                    buttonClassName="h-full w-full border !border-subtle bg-surface-1 text-body-sm-regular"
                    buttonContainerClassName="h-full w-full"
                    placeholder={t("workspace_products.validation.owner_required")}
                    showUserDetails
                  />
                </div>
                {ownerError ? <p className="mt-1.5 text-caption-md-regular text-danger-primary">{ownerError}</p> : null}
                {willLosePrivateAccess ? (
                  <div className="mt-1.5 flex items-start gap-2 text-caption-md-regular text-warning-primary">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{t("workspace_products.visibility.private_access_warning")}</span>
                  </div>
                ) : null}
              </div>
            }
          />

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="primary" loading={isSaving} onClick={() => void handleSave()}>
              {t("workspace_products.settings.update_product")}
            </Button>
            {createdAt && (
              <p className="text-caption-md-regular text-tertiary">
                {t("workspace_products.settings.created_on", { date: createdAt })}
              </p>
            )}
          </div>
        </div>

        <div className="mt-10 rounded-lg border border-subtle bg-layer-2">
          <SettingsBoxedControlItem
            className="rounded-b-none border-0 border-b"
            title={
              <span className="flex items-center gap-2">
                <Archive className="size-4 text-tertiary" />
                {t("workspace_products.settings.archive.title")}
              </span>
            }
            description={t("workspace_products.settings.archive.description")}
            control={
              <Button variant="secondary" disabled>
                {t("workspace_products.settings.archive.button")}
              </Button>
            }
          />
          <SettingsBoxedControlItem
            className="rounded-t-none border-0"
            title={
              <span className="flex items-center gap-2">
                <Trash2 className="size-4 text-danger-primary" />
                {t("workspace_products.settings.delete.title")}
              </span>
            }
            description={t("workspace_products.settings.delete.description")}
            control={
              <Button variant="error-outline" onClick={() => setProductToDelete(product)}>
                {t("workspace_products.settings.delete.button")}
              </Button>
            }
          />
        </div>
      </div>

      <DeleteProductModal
        onDeleted={() => {
          navigate(`/${workspaceSlug}/products`, { replace: true });
        }}
      />
    </SettingsContentWrapper>
  );
});
