import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { AlertTriangle } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { PRODUCT_SETTINGS_EDIT_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EUserWorkspaceRoles } from "@plane/types";
import type { TLogoProps, TProduct, TProductNetwork } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { isValidIdentifier } from "@/components/common/identifier-input";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { useProductEditorAssets } from "@/hooks/use-product-editor-assets";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { WorkspaceService } from "@/services/workspace.service";
import { useProductsContext } from "./context";
import {
  PRODUCT_FORM_DICTIONARY_KEYS,
  PRODUCT_REQUIRED_EXTENDED_FIELDS,
  getMissingRequiredFields,
  useProductExtendedFields,
} from "./extended-fields";
import { hasProductPermission } from "./permissions";
import { getProductLogoDefaults } from "./logo-header";
import { ProductModalBasics } from "./modal-basics";
import { ProductModalFooter } from "./modal-footer";
import { ProductModalIdentity } from "./modal-identity";
import { ProductModalProperties } from "./modal-properties";

const workspaceService = new WorkspaceService();
const EMPTY_DESCRIPTION = "<p></p>";
/** 名称、开发编号、产品负责人不在扩展字段里，单独算进必填数 */
const IDENTITY_REQUIRED_COUNT = 3;

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
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [attachmentWarning, setAttachmentWarning] = useState(false);
  const [persistedProductId, setPersistedProductId] = useState<string | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);

  const draftEntityId = useRef(uuidv4());
  const persistedProduct = useRef<TProduct | null>(null);
  // 身份区的 logo 按钮在 DOM 里排在名称之前，不显式指定焦点回车会落在它上面
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const { isOpen, mode, product } = modal;
  const editable = mode !== "view";
  const extended = useProductExtendedFields({ product, mode });
  // 一次拉全量字典给 7 个下拉（6 个 FK + 项目代号）共用；查看态不请求
  const { isLoading: isDictionaryLoading, getDictionaryByKey } = useDataDictionaries(workspaceSlug, {
    autoFetch: isOpen && editable,
  });
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
  const canManageProduct = hasProductPermission(product, PRODUCT_SETTINGS_EDIT_PERMISSION_KEY);
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
    extended.reset(product);
    // 老产品可能没有 logo：不注入随机默认，展示层用 PackageOpen 兜底
    setLogoProps(
      mode === "create"
        ? getProductLogoDefaults().logoProps
        : product?.logo_props?.in_use
          ? product.logo_props
          : undefined
    );
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
  }, [currentUser?.id, extended.reset, isOpen, mode, product?.id, product?.updated_at, resetAssets]);

  const handleClose = async () => {
    if (isSaving) return;
    if (editable && !(mode === "create" && persistedProductId)) {
      await cleanupSessionAssets();
    }
    closeProductModal();
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    // 所有字段一起校验、一起报错，不能报完一个就 return
    const nextNameError = trimmedName
      ? null
      : t("workspace_products.validation.required", { field: t("workspace_products.fields.name") });
    const nextIdentifierError = !identifier
      ? t("workspace_products.validation.required", { field: t("workspace_products.fields.identifier") })
      : isValidIdentifier(identifier)
        ? null
        : t("common.identifier.invalid");
    const nextOwnerError = ownerId ? null : t("workspace_products.validation.owner_required");
    const isExtendedValid = extended.validate();
    setFormError(nextNameError);
    setIdentifierError(nextIdentifierError);
    setOwnerError(nextOwnerError);
    if (nextNameError || nextIdentifierError || nextOwnerError || !isExtendedValid) return;

    setIsSaving(true);
    extended.clearErrors();
    setAttachmentWarning(false);
    const payload = {
      name: trimmedName,
      identifier,
      description_html: descriptionHTML,
      network,
      owner: ownerId,
      ...(logoProps ? { logo_props: logoProps } : {}),
      ...extended.getPayload(),
    };

    try {
      let savedProduct;
      if (mode === "create") {
        if (persistedProductId) {
          // 重试路径：产品已建成，只需补描述附件
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
      const errorPayload =
        error && typeof error === "object"
          ? (error as { name?: string[]; identifier?: string[]; owner?: string[] })
          : {};
      // DRF 一次返回所有字段的错误，逐个落到对应字段上，不要只挑第一个
      if (errorPayload.owner?.[0]) {
        setOwnerError(
          errorPayload.owner[0] === "PRODUCT_OWNER_NOT_MEMBER"
            ? t("workspace_products.validation.owner_not_member")
            : String(errorPayload.owner[0])
        );
      }
      if (errorPayload.identifier?.[0]) {
        // 后端返回 PRODUCT_IDENTIFIER_ALREADY_EXISTS / _INVALID 两种错误码
        setIdentifierError(
          errorPayload.identifier[0] === "PRODUCT_IDENTIFIER_ALREADY_EXISTS"
            ? t("workspace_products.validation.identifier_already_exists")
            : t("common.identifier.invalid")
        );
      }
      const hasExtendedErrors = extended.applyServerErrors(error);
      if (errorPayload.name?.[0]) {
        setFormError(
          errorPayload.name[0] === "PRODUCT_NAME_ALREADY_EXISTS"
            ? t("workspace_products.validation.name_already_exists")
            : String(errorPayload.name[0])
        );
      } else if (!errorPayload.owner?.[0] && !errorPayload.identifier?.[0] && !hasExtendedErrors) {
        setToast({ type: TOAST_TYPE.ERROR, title: t("workspace_products.toast.failed") });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const requiredTotal = PRODUCT_REQUIRED_EXTENDED_FIELDS.length + IDENTITY_REQUIRED_COUNT;
  const requiredFilled =
    requiredTotal -
    getMissingRequiredFields(extended.values).length -
    [name.trim(), identifier, ownerId].filter((value) => !value).length;
  const hasErrors = Boolean(formError || identifierError || ownerError || extended.hasErrors);

  const descriptionField = !workspaceId ? (
    <Loader className="flex-1">
      <Loader.Item height="160px" />
    </Loader>
  ) : (
    <div className="flex min-h-40 flex-1 flex-col overflow-hidden rounded-[10px] border border-subtle-1 bg-layer-2">
      <div data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto">
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
            // 不要占位文字；不传会落到编辑器默认的 "Press '/' for commands..."
            placeholder={() => ""}
            searchMentionCallback={(payload) => workspaceService.searchEntity(workspaceSlug, payload)}
            uploadFile={handleUpload}
            duplicateFile={handleDuplicate}
            containerClassName="min-h-full pt-3 pr-3.5 pb-3 text-14"
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
            containerClassName="min-h-full pt-3 pr-3.5 pb-3 text-14"
          />
        )}
      </div>
    </div>
  );

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => void handleClose()}
      position={EModalPosition.TOP}
      width={EModalWidth.XXXXL}
      className="rounded-2xl sm:max-w-[72rem]"
      initialFocus={nameInputRef}
    >
      <div className="relative flex h-[min(90vh,52rem)] min-h-0 flex-col">
        {isDetailLoading && product ? (
          <div className="flex-1 px-9 pt-8">
            <Loader className="space-y-4">
              <Loader.Item height="64px" width="60%" />
              <Loader.Item height="42px" />
              <Loader.Item height="240px" />
            </Loader>
          </div>
        ) : (
          // 宽屏左右两栏各自滚动；窄屏上下堆叠，整体一起滚
          <div
            data-modal-wheel-scroll
            className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_28.5rem] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden"
          >
            <div
              data-modal-wheel-scroll
              className="vertical-scrollbar scrollbar-sm flex min-w-0 flex-col px-7 pt-7.5 pb-7 md:min-h-0 md:overflow-y-auto md:px-9"
            >
              <ProductModalIdentity
                title={t(
                  mode === "create"
                    ? "workspace_products.create_product"
                    : mode === "edit"
                      ? "workspace_products.edit_product"
                      : "workspace_products.view_product"
                )}
                editable={editable}
                name={name}
                onNameChange={(value) => {
                  setName(value);
                  setFormError(null);
                }}
                nameError={formError}
                identifier={identifier}
                onIdentifierChange={(value) => {
                  setIdentifier(value);
                  setIdentifierError(null);
                }}
                identifierError={identifierError}
                network={network}
                onNetworkChange={setNetwork}
                logoProps={logoProps}
                onLogoChange={setLogoProps}
                isMobile={isMobile}
                nameInputRef={nameInputRef}
                autoFocusName={mode === "create"}
              />
              <div className="my-6 border-t border-subtle" />
              <ProductModalBasics
                workspaceSlug={workspaceSlug}
                editable={editable}
                values={extended.values}
                errors={extended.errors}
                onChange={extended.setValue}
                codeDictionary={getDictionaryByKey(PRODUCT_FORM_DICTIONARY_KEYS.code)}
                isDictionaryLoading={isDictionaryLoading}
                description={descriptionField}
              />
              {attachmentWarning && (
                <div className="mt-4 flex gap-3 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2.5">
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

            <ProductModalProperties
              workspaceSlug={workspaceSlug}
              editable={editable}
              product={product}
              values={extended.values}
              errors={extended.errors}
              onChange={extended.setValue}
              getDictionaryByKey={getDictionaryByKey}
              isDictionaryLoading={isDictionaryLoading}
              owner={{
                value: ownerId,
                onChange: (value) => {
                  setOwnerId(value);
                  setOwnerError(null);
                },
                error: ownerError,
                memberIds: ownerCandidateIds,
                warning: willLosePrivateAccess ? t("workspace_products.visibility.private_access_warning") : null,
              }}
            />
          </div>
        )}

        <ProductModalFooter
          mode={mode}
          requiredFilled={requiredFilled}
          requiredTotal={requiredTotal}
          hasErrors={hasErrors}
          isSaving={isSaving}
          primaryLabel={
            persistedProductId && attachmentWarning
              ? t("retry")
              : mode === "create"
                ? t("workspace_products.create_product")
                : t("save_changes")
          }
          onCancel={() => void handleClose()}
          onSave={() => void handleSave()}
          onEdit={mode === "view" && product && canManageProduct ? () => openProductModal("edit", product) : undefined}
        />

        <button
          type="button"
          onClick={() => void handleClose()}
          aria-label={t("close")}
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>
    </ModalCore>
  );
});
