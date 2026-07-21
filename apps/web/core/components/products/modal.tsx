import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { AlertTriangle, Globe2, LockKeyhole, PackageOpen, Pencil, UserRound, X } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EUserWorkspaceRoles } from "@plane/types";
import type { TProduct, TProductNetwork } from "@plane/types";
import { Avatar, AvatarGroup, CustomSelect, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { RichTextEditor } from "@/components/editor/rich-text";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useProductEditorAssets } from "@/hooks/use-product-editor-assets";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WorkspaceService } from "@/services/workspace.service";
import { useProductsContext } from "./context";

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
  const [descriptionHTML, setDescriptionHTML] = useState(EMPTY_DESCRIPTION);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [network, setNetwork] = useState<TProductNetwork>(2);
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
  const hasWorkspaceAdminAccess =
    workspaceInfo?.role === EUserWorkspaceRoles.ADMIN || hasAllWorkspacePermissions(workspaceSlug);
  const canManageProduct = Boolean(product && (product.owner === currentUser?.id || hasWorkspaceAdminAccess));
  const willLosePrivateAccess = Boolean(
    editable &&
    isPrivateProduct &&
    ownerId &&
    ownerId !== currentUser?.id &&
    !reviewerIds.includes(currentUser?.id ?? "") &&
    !hasWorkspaceAdminAccess
  );

  useEffect(() => {
    if (!isOpen) return;
    setName(product?.name ?? "");
    setDescriptionHTML(product?.description_html?.trim() ? product.description_html : EMPTY_DESCRIPTION);
    setOwnerId(product?.owner ?? currentUser?.id ?? null);
    setReviewerIds(product?.reviewers ?? []);
    setNetwork(product?.network ?? 2);
    setFormError(null);
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
    if (!ownerId) {
      setOwnerError(t("workspace_products.validation.owner_required"));
      return;
    }

    setIsSaving(true);
    setFormError(null);
    setOwnerError(null);
    setAttachmentWarning(false);
    const payload = {
      name: trimmedName,
      description_html: descriptionHTML,
      network,
      owner: ownerId,
      reviewers: reviewerIds,
    };

    try {
      let savedProduct;
      if (mode === "create") {
        if (persistedProductId) {
          if (!persistedProduct.current) return;
          savedProduct = persistedProduct.current;
        } else {
          savedProduct = await createProduct(payload);
          setPersistedProductId(savedProduct.id);
          persistedProduct.current = savedProduct;
        }
      } else if (product) {
        savedProduct = await updateProduct(product.id, payload);
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
      const errorPayload = error && typeof error === "object" ? (error as { name?: string[]; owner?: string[] }) : {};
      if (errorPayload.owner?.[0]) {
        setOwnerError(String(errorPayload.owner[0]));
      } else {
        setFormError(String(errorPayload.name?.[0] ?? t("workspace_products.toast.failed")));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const title =
    mode === "create"
      ? t("workspace_products.create_product")
      : mode === "edit"
        ? t("workspace_products.edit_product")
        : t("workspace_products.view_product");

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => void handleClose()}
      position={EModalPosition.CENTER}
      width={EModalWidth.VIXL}
      className="h-[calc(100dvh-2rem)] overflow-hidden sm:h-auto sm:max-h-[min(88vh,880px)]"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-subtle px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-layer-2 text-secondary">
              <PackageOpen className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-16 font-medium text-primary">{title}</h2>
              {product && mode !== "create" && <p className="truncate text-11 text-secondary">{product.name}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleClose()}
            className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label={t("close")}
          >
            <X className="size-4" />
          </button>
        </div>

        {isDetailLoading && product ? (
          <div className="p-6">
            <Loader>
              <Loader.Item height="40px" />
              <Loader.Item height="260px" />
            </Loader>
          </div>
        ) : (
          <div data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0 space-y-5">
                <div>
                  <label htmlFor="product-name" className="mb-1.5 block text-12 font-medium text-secondary">
                    {t("workspace_products.fields.name")}
                  </label>
                  {editable ? (
                    <input
                      id="product-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={255}
                      autoFocus={mode === "create"}
                      className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder"
                      placeholder={t("workspace_products.fields.name")}
                    />
                  ) : (
                    <p className="text-18 font-semibold text-primary">{name}</p>
                  )}
                  {formError && <p className="mt-1.5 text-11 text-danger-primary">{formError}</p>}
                </div>

                <div>
                  <p className="mb-1.5 text-12 font-medium text-secondary">
                    {t("workspace_products.fields.description")}
                  </p>
                  {!workspaceId ? (
                    <Loader>
                      <Loader.Item height="260px" />
                    </Loader>
                  ) : (
                    <div className="min-h-[260px] overflow-hidden rounded-md border border-subtle bg-surface-1">
                      <div className="vertical-scrollbar scrollbar-sm max-h-[52vh] min-h-[260px] overflow-y-auto">
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
                            containerClassName="min-h-[260px] pr-3 pt-3 text-13"
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
                            containerClassName="min-h-[260px] pr-3 pt-3 text-13"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <aside className="space-y-4 lg:border-l lg:border-subtle lg:pl-6">
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-11 font-medium text-secondary">
                    <UserRound className="size-3.5" /> {t("workspace_products.fields.owner")}
                  </p>
                  {editable ? (
                    <div className="h-8">
                      <MemberDropdown
                        multiple={false}
                        value={ownerId}
                        onChange={(value) => {
                          setOwnerId(value);
                          setOwnerError(null);
                        }}
                        buttonVariant="border-with-text"
                        buttonClassName="h-8 w-full border !border-subtle bg-surface-1"
                        buttonContainerClassName="w-full"
                        placeholder={t("workspace_products.validation.owner_required")}
                        showUserDetails
                      />
                    </div>
                  ) : (
                    <div className="flex h-8 items-center gap-2 text-12 text-primary">
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
                  {ownerError && <p className="mt-1.5 text-11 text-danger-primary">{ownerError}</p>}
                </div>

                <div>
                  <p className="mb-1.5 text-11 font-medium text-secondary">
                    {t("workspace_products.fields.reviewers")}
                  </p>
                  {editable ? (
                    <div className="h-8">
                      <MemberDropdown
                        multiple
                        value={reviewerIds}
                        onChange={setReviewerIds}
                        buttonVariant="border-with-text"
                        buttonClassName="h-8 w-full border !border-subtle bg-surface-1"
                        buttonContainerClassName="w-full"
                        placeholder={t("workspace_products.fields.reviewers")}
                        showUserDetails
                      />
                    </div>
                  ) : product?.reviewer_details?.length ? (
                    <div className="flex items-center gap-2">
                      <AvatarGroup showTooltip>
                        {product.reviewer_details.map((reviewer) => (
                          <Avatar
                            key={reviewer.id}
                            size="sm"
                            name={reviewer.display_name}
                            src={getFileURL(reviewer.avatar_url ?? "")}
                          />
                        ))}
                      </AvatarGroup>
                      <span className="text-11 text-secondary">{product.reviewer_details.length}</span>
                    </div>
                  ) : (
                    <span className="text-12 text-placeholder">-</span>
                  )}
                </div>

                <div>
                  <p className="mb-1.5 text-11 font-medium text-secondary">
                    {t("workspace_products.fields.visibility")}
                  </p>
                  {editable ? (
                    <CustomSelect
                      value={network}
                      onChange={(value: TProductNetwork) => setNetwork(value)}
                      className="w-full"
                      buttonClassName="h-8 !border-subtle bg-surface-1"
                      optionsClassName="w-[min(20rem,calc(100vw-2rem))]"
                      label={
                        <span className="flex min-w-0 items-center gap-1.5 text-11 font-medium text-primary">
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
                        </span>
                      }
                    >
                      <CustomSelect.Option value={2}>
                        <div className="flex min-w-0 items-start gap-2 py-0.5">
                          <Globe2 className="mt-0.5 size-3.5 shrink-0" />
                          <div className="min-w-0 whitespace-normal">
                            <p className="text-11 font-medium text-primary">
                              {t("workspace_products.visibility.public")}
                            </p>
                            <p className="mt-0.5 text-11 leading-4 text-secondary">
                              {t("workspace_products.visibility.public_description")}
                            </p>
                          </div>
                        </div>
                      </CustomSelect.Option>
                      <CustomSelect.Option value={0}>
                        <div className="flex min-w-0 items-start gap-2 py-0.5">
                          <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
                          <div className="min-w-0 whitespace-normal">
                            <p className="text-11 font-medium text-primary">
                              {t("workspace_products.visibility.private")}
                            </p>
                            <p className="mt-0.5 text-11 leading-4 text-secondary">
                              {t("workspace_products.visibility.private_description")}
                            </p>
                          </div>
                        </div>
                      </CustomSelect.Option>
                    </CustomSelect>
                  ) : (
                    <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-layer-2 px-2 text-11 font-medium text-secondary">
                      {isPrivateProduct ? <LockKeyhole className="size-3.5" /> : <Globe2 className="size-3.5" />}
                      {t(
                        isPrivateProduct
                          ? "workspace_products.visibility.private"
                          : "workspace_products.visibility.public"
                      )}
                    </span>
                  )}
                  {willLosePrivateAccess && (
                    <p className="mt-2 flex items-start gap-1.5 text-11 leading-4 text-warning-primary">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {t("workspace_products.visibility.private_access_warning")}
                    </p>
                  )}
                </div>
              </aside>
            </div>

            {attachmentWarning && (
              <div className="mx-4 mb-4 flex gap-3 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2.5 sm:mx-6 sm:mb-6">
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
        )}

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle px-4 py-3 sm:px-6">
          <Button variant="secondary" onClick={() => void handleClose()} disabled={isSaving}>
            {mode === "view" ? t("close") : t("cancel")}
          </Button>
          {mode === "view" && product && canManageProduct ? (
            <Button variant="primary" onClick={() => openProductModal("edit", product)}>
              <Pencil className="size-3.5" /> {t("workspace_products.actions.edit")}
            </Button>
          ) : mode !== "view" ? (
            <Button variant="primary" onClick={() => void handleSave()} loading={isSaving}>
              {persistedProductId && attachmentWarning ? t("retry") : t("save_changes")}
            </Button>
          ) : null}
        </div>
      </div>
    </ModalCore>
  );
});
