import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { AlertTriangle, Globe2, LockKeyhole, Pencil, X } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { InfoIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { EFileAssetType, EUserWorkspaceRoles } from "@plane/types";
import type { TLogoProps, TProduct, TProductNetwork } from "@plane/types";
import { Avatar, CustomSelect, EModalPosition, EModalWidth, Input, Loader, ModalCore } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import {
  IDENTIFIER_MAX_LENGTH,
  isValidIdentifier,
  sanitizeIdentifier,
} from "@/components/common/identifier-input";
import { RichTextEditor } from "@/components/editor/rich-text";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { handleCoverImageChange } from "@/helpers/cover-image.helper";
import { useProductEditorAssets } from "@/hooks/use-product-editor-assets";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { WorkspaceService } from "@/services/workspace.service";
import { useProductsContext } from "./context";
import {
  ProductLogoCoverHeader,
  buildCreateProductCoverPayload,
  getProductLogoCoverDefaults,
} from "./logo-cover-header";

const workspaceService = new WorkspaceService();
const EMPTY_DESCRIPTION = "<p></p>";

export const ProductModal = observer(function ProductModal() {
  const { t } = useTranslation();
  const { workspaceSlug, modal, isDetailLoading, createProduct, updateProduct, closeProductModal, openProductModal } =
    useProductsContext();
  const { getWorkspaceBySlug } = useWorkspace();
  const { data: currentUser } = useUser();
  const { workspaceInfoBySlug, hasAllWorkspacePermissions } = useUserPermissions();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString();
  const workspaceInfo = workspaceInfoBySlug(workspaceSlug);

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
  const [attachmentWarning, setAttachmentWarning] = useState(false);
  const [persistedProductId, setPersistedProductId] = useState<string | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);

  const draftEntityId = useRef(uuidv4());
  const persistedProduct = useRef<TProduct | null>(null);
  const { isOpen, mode, product } = modal;
  const editable = mode !== "view";
  const isPrivateProduct = network === 0;
  const editorEntityId = mode === "create" ? draftEntityId.current : (product?.id ?? "product");
  const {
    bindActiveSessionAssets,
    cleanupSessionAssets,
    commitAssets,
    handleDeferredAssetDelete,
    handleDuplicate,
    handleUpload,
    resetAssets,
  } = useProductEditorAssets({ entityId: editorEntityId, workspaceSlug });
  const { isMobile } = usePlatformOS();
  // 编辑态才按产品成员收窄负责人候选；创建态产品还不存在、成员表为空，
  // 只能从工作区成员里选，后端会把选中的人落成首个产品成员。
  const ownerScopeProductId = isOpen && editable && mode !== "create" ? product?.id : undefined;
  const { members: productMembers } = useProductMembers(workspaceSlug, ownerScopeProductId);
  const ownerCandidateIds = useMemo(() => {
    if (!ownerScopeProductId) return undefined;
    const ids = productMembers.map((membership) => membership.member);
    // 成员还在加载时先兜住当前负责人，否则下拉会短暂空掉
    if (product?.owner && !ids.includes(product.owner)) ids.unshift(product.owner);
    return ids;
  }, [ownerScopeProductId, product?.owner, productMembers]);
  const hasWorkspaceAdminAccess =
    workspaceInfo?.role === EUserWorkspaceRoles.ADMIN || hasAllWorkspacePermissions(workspaceSlug);
  const canManageProduct = Boolean(product && (product.owner === currentUser?.id || hasWorkspaceAdminAccess));
  const isProductMember = Boolean(
    currentUser?.id && productMembers.some((membership) => membership.member === currentUser.id)
  );
  const willLosePrivateAccess = Boolean(
    editable &&
    isPrivateProduct &&
    ownerId &&
    ownerId !== currentUser?.id &&
    !isProductMember &&
    !hasWorkspaceAdminAccess
  );

  useEffect(() => {
    if (!isOpen) return;
    setName(product?.name ?? "");
    setIdentifier(product?.identifier ?? "");
    setDescriptionHTML(product?.description_html?.trim() ? product.description_html : EMPTY_DESCRIPTION);
    setOwnerId(product?.owner ?? currentUser?.id ?? null);
    setNetwork(product?.network ?? 2);
    if (mode === "create") {
      const visualDefaults = getProductLogoCoverDefaults();
      setLogoProps(visualDefaults.logoProps);
      setCoverImageUrl(visualDefaults.coverImageUrl);
    } else {
      // 老产品可能没有 logo/封面：不注入随机默认，展示层用 PackageOpen/默认封面兜底
      setLogoProps(product?.logo_props?.in_use ? product.logo_props : undefined);
      setCoverImageUrl(product?.cover_image_url ?? null);
    }
    setFormError(null);
    setIdentifierError(null);
    setOwnerError(null);
    setAttachmentWarning(false);
    setPersistedProductId(null);
    persistedProduct.current = null;
    setIsSaving(false);
    draftEntityId.current = uuidv4();
    resetAssets();
    setEditorVersion((version) => version + 1);
  }, [currentUser?.id, isOpen, mode, product?.id, product?.updated_at, resetAssets]);

  const handleClose = async () => {
    if (isSaving) return;
    if (editable && !(mode === "create" && persistedProductId)) {
      await cleanupSessionAssets();
    }
    closeProductModal();
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError(t("workspace_products.fields.name"));
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

    setIsSaving(true);
    setFormError(null);
    setIdentifierError(null);
    setOwnerError(null);
    setAttachmentWarning(false);
    const payload = {
      name: trimmedName,
      identifier,
      description_html: descriptionHTML,
      network,
      owner: ownerId,
      ...(logoProps ? { logo_props: logoProps } : {}),
    };

    try {
      let savedProduct;
      if (mode === "create") {
        if (persistedProductId) {
          // 重试路径：产品已建成（封面也已绑定），只需补描述附件
          if (!persistedProduct.current) return;
          savedProduct = persistedProduct.current;
        } else {
          let coverPayload: { cover_image?: string | null; cover_image_asset?: string | null } = {};
          try {
            coverPayload = await buildCreateProductCoverPayload(workspaceSlug, coverImageUrl);
          } catch {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: t("workspace_products.error.cover_upload_title"),
              message: t("workspace_products.error.cover_upload_description"),
            });
            return;
          }
          savedProduct = await createProduct({ ...payload, ...coverPayload });
          setPersistedProductId(savedProduct.id);
          persistedProduct.current = savedProduct;
        }
      } else if (product) {
        // 编辑换封面：静态图/上传在资产确认时由后端直接回写绑定，外链才进 PATCH payload
        const coverPayload = await handleCoverImageChange(product.cover_image_url, coverImageUrl, {
          workspaceSlug,
          entityIdentifier: product.id,
          entityType: EFileAssetType.PRODUCT_COVER,
        });
        savedProduct = await updateProduct(product.id, { ...payload, ...(coverPayload ?? {}) });
      } else {
        return;
      }

      if (mode === "create") {
        try {
          await bindActiveSessionAssets(savedProduct.id, descriptionHTML);
        } catch {
          setAttachmentWarning(true);
          setToast({
            type: TOAST_TYPE.WARNING,
            title: t("workspace_products.error.attachment_title"),
            message: t("workspace_products.error.attachment_description"),
          });
          return;
        }
      }

      await commitAssets(descriptionHTML);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t(mode === "create" ? "workspace_products.toast.created" : "workspace_products.toast.updated"),
      });
      closeProductModal();
    } catch (error) {
      const errorPayload =
        error && typeof error === "object"
          ? (error as { name?: string[]; identifier?: string[]; owner?: string[] })
          : {};
      if (errorPayload.owner?.[0]) {
        setOwnerError(
          errorPayload.owner[0] === "PRODUCT_OWNER_NOT_MEMBER"
            ? t("workspace_products.validation.owner_not_member")
            : String(errorPayload.owner[0])
        );
      } else if (errorPayload.identifier?.[0]) {
        // 后端返回 PRODUCT_IDENTIFIER_ALREADY_EXISTS / _INVALID 两种错误码
        setIdentifierError(
          errorPayload.identifier[0] === "PRODUCT_IDENTIFIER_ALREADY_EXISTS"
            ? t("common.identifier.already_exists")
            : t("common.identifier.invalid")
        );
      } else {
        setFormError(String(errorPayload.name?.[0] ?? t("workspace_products.toast.failed")));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => void handleClose()}
      position={EModalPosition.TOP}
      width={EModalWidth.XXXXL}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="relative">
          <ProductLogoCoverHeader
            coverImageUrl={coverImageUrl}
            logoProps={logoProps}
            editable={editable}
            entityIdentifier={mode === "create" ? "" : (product?.id ?? "")}
            onCoverChange={setCoverImageUrl}
            onLogoChange={setLogoProps}
            className="rounded-lg"
          />
          <button
            type="button"
            onClick={() => void handleClose()}
            className="absolute top-2 right-2 grid size-8 place-items-center rounded-md text-on-color hover:bg-layer-transparent-hover"
            aria-label={t("close")}
          >
            <X className="size-5" />
          </button>
        </div>

        {isDetailLoading && product ? (
          <div className="p-3 pt-9">
            <Loader>
              <Loader.Item height="38px" />
              <Loader.Item height="96px" />
            </Loader>
          </div>
        ) : (
          <div data-modal-wheel-scroll className="px-3">
            <div className="mt-9 space-y-6 pb-5">
              <div className="grid grid-cols-1 gap-x-2 gap-y-3 md:grid-cols-4">
                <div className="md:col-span-3">
                  {editable ? (
                    <Input
                      id="product-name"
                      name="name"
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={255}
                      autoFocus={mode === "create"}
                      hasError={Boolean(formError)}
                      placeholder={t("workspace_products.fields.name")}
                      className="focus:border-blue-400 h-[38px] min-h-[38px] w-full !py-0 text-13 leading-5"
                    />
                  ) : (
                    <p className="text-18 font-semibold text-primary">{name}</p>
                  )}
                  {formError && <span className="text-11 text-danger-primary">{formError}</span>}
                </div>

                <div className="md:col-span-1">
                  <div className="relative">
                    {editable ? (
                      <Input
                        id="product-identifier"
                        name="identifier"
                        type="text"
                        value={identifier}
                        onChange={(event) => {
                          setIdentifier(sanitizeIdentifier(event.target.value));
                          setIdentifierError(null);
                        }}
                        maxLength={IDENTIFIER_MAX_LENGTH}
                        hasError={Boolean(identifierError)}
                        placeholder={t("workspace_products.fields.identifier")}
                        className={cn(
                          "focus:border-blue-400 h-[38px] min-h-[38px] w-full !py-0 pr-7 text-13 leading-5",
                          { uppercase: identifier }
                        )}
                      />
                    ) : (
                      <p className="flex h-[38px] items-center text-13 text-primary">{identifier || "—"}</p>
                    )}
                    <Tooltip
                      isMobile={isMobile}
                      tooltipContent={t("workspace_products.fields.identifier_hint")}
                      className="text-13"
                      position="right-start"
                    >
                      <InfoIcon className="absolute top-1/2 right-2 h-3 w-3 -translate-y-1/2 text-placeholder" />
                    </Tooltip>
                  </div>
                  {identifierError && <span className="text-11 text-danger-primary">{identifierError}</span>}
                </div>

                <div className="md:col-span-4">
                  {!workspaceId ? (
                    <Loader>
                      <Loader.Item height="96px" />
                    </Loader>
                  ) : (
                    <div className="overflow-hidden rounded-md border border-subtle bg-surface-1">
                      <div className="vertical-scrollbar scrollbar-sm max-h-[40vh] min-h-24 overflow-y-auto">
                        {editable ? (
                          <RichTextEditor
                            key={`product-editor-${editorEntityId}-${editorVersion}`}
                            id={editorEntityId}
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
                            containerClassName="min-h-24 pr-3 pt-3 text-13"
                          />
                        ) : (
                          <RichTextEditor
                            key={`product-view-${editorEntityId}-${editorVersion}`}
                            id={editorEntityId}
                            editable={false}
                            initialValue={descriptionHTML}
                            value={null}
                            workspaceSlug={workspaceSlug}
                            workspaceId={workspaceId}
                            dragDropEnabled={false}
                            containerClassName="min-h-24 pr-3 pt-3 text-13"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {editable ? (
                  <div className="h-7 flex-shrink-0">
                    <CustomSelect
                      value={network}
                      onChange={(value: TProductNetwork) => setNetwork(value)}
                      className="h-full"
                      buttonClassName="h-full"
                      optionsClassName="w-[min(20rem,calc(100vw-2rem))]"
                      noChevron
                      label={
                        <div className="flex h-full items-center gap-1">
                          {isPrivateProduct ? (
                            <LockKeyhole className="size-3.5 shrink-0" />
                          ) : (
                            <Globe2 className="size-3.5 shrink-0" />
                          )}
                          {t(
                            isPrivateProduct
                              ? "workspace_products.visibility.private"
                              : "workspace_products.visibility.public"
                          )}
                        </div>
                      }
                    >
                      <CustomSelect.Option value={2}>
                        <div className="flex items-start gap-2">
                          <Globe2 className="mt-0.5 size-3.5 shrink-0" />
                          <div className="-mt-1">
                            <p>{t("workspace_products.visibility.public")}</p>
                            <p className="text-11 text-placeholder">
                              {t("workspace_products.visibility.public_description")}
                            </p>
                          </div>
                        </div>
                      </CustomSelect.Option>
                      <CustomSelect.Option value={0}>
                        <div className="flex items-start gap-2">
                          <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
                          <div className="-mt-1">
                            <p>{t("workspace_products.visibility.private")}</p>
                            <p className="text-11 text-placeholder">
                              {t("workspace_products.visibility.private_description")}
                            </p>
                          </div>
                        </div>
                      </CustomSelect.Option>
                    </CustomSelect>
                  </div>
                ) : (
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-subtle px-2 text-11 font-medium text-secondary">
                    {isPrivateProduct ? <LockKeyhole className="size-3.5" /> : <Globe2 className="size-3.5" />}
                    {t(
                      isPrivateProduct
                        ? "workspace_products.visibility.private"
                        : "workspace_products.visibility.public"
                    )}
                  </span>
                )}

                {editable ? (
                  <div className="relative h-7 flex-shrink-0">
                    <MemberDropdown
                      multiple={false}
                      value={ownerId}
                      memberIds={ownerCandidateIds}
                      onChange={(value) => {
                        setOwnerId(value);
                        setOwnerError(null);
                      }}
                      buttonVariant="border-with-text"
                      buttonClassName={cn("text-11", ownerError && "border-danger-strong")}
                      placeholder={t("workspace_products.fields.owner")}
                      showUserDetails
                    />
                    {ownerError && (
                      <span className="absolute left-0 top-full z-10 mt-0.5 whitespace-nowrap text-caption-sm-medium text-danger-primary">
                        {ownerError}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex h-7 items-center gap-1.5 rounded-md border border-subtle px-2 text-11 text-primary">
                    <Avatar
                      size="sm"
                      name={product?.owner_detail?.display_name ?? currentUser?.display_name ?? ""}
                      src={getFileURL(product?.owner_detail?.avatar_url ?? currentUser?.avatar_url ?? "")}
                      showTooltip={false}
                    />
                    <span className="truncate">
                      {product?.owner_detail?.display_name ?? currentUser?.display_name ?? "-"}
                    </span>
                  </div>
                )}

                {willLosePrivateAccess && (
                  <p className="flex w-full items-start gap-1.5 text-11 leading-4 text-warning-primary">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {t("workspace_products.visibility.private_access_warning")}
                  </p>
                )}
              </div>

              {attachmentWarning && (
                <div className="flex gap-3 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-primary" />
                  <div>
                    <p className="text-12 font-medium text-primary">{t("workspace_products.error.attachment_title")}</p>
                    <p className="mt-0.5 text-11 text-secondary">
                      {t("workspace_products.error.attachment_description")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-subtle px-3 py-4">
          <Button variant="secondary" size="lg" onClick={() => void handleClose()} disabled={isSaving}>
            {mode === "view" ? t("close") : t("cancel")}
          </Button>
          {mode === "view" && product && canManageProduct ? (
            <Button variant="primary" size="lg" onClick={() => openProductModal("edit", product)}>
              <Pencil className="size-3.5" /> {t("workspace_products.actions.edit")}
            </Button>
          ) : mode !== "view" ? (
            <Button variant="primary" size="lg" onClick={() => void handleSave()} loading={isSaving}>
              {persistedProductId && attachmentWarning
                ? t("retry")
                : mode === "create"
                  ? t("workspace_products.create_product")
                  : t("save_changes")}
            </Button>
          ) : null}
        </div>
      </div>
    </ModalCore>
  );
});
