import { useEffect, useState } from "react";
import { AlertTriangle, Archive, Globe2, LockKeyhole, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EUserWorkspaceRoles } from "@plane/types";
import type { TProductNetwork } from "@plane/types";
import { CustomSelect, Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { RichTextEditor } from "@/components/editor/rich-text";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PageHead } from "@/components/core/page-title";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { useProductEditorAssets } from "@/hooks/use-product-editor-assets";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WorkspaceService } from "@/services/workspace.service";
import { useProductsContext } from "../context";
import { DeleteProductModal } from "../delete-modal";
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

  const [name, setName] = useState("");
  const [descriptionHTML, setDescriptionHTML] = useState(EMPTY_DESCRIPTION);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [network, setNetwork] = useState<TProductNetwork>(2);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);

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
  const willLosePrivateAccess = Boolean(
    isPrivateProduct &&
    ownerId &&
    ownerId !== currentUser?.id &&
    !reviewerIds.includes(currentUser?.id ?? "") &&
    !hasWorkspaceAdminAccess
  );

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setDescriptionHTML(product.description_html?.trim() ? product.description_html : EMPTY_DESCRIPTION);
    setOwnerId(product.owner);
    setReviewerIds(product.reviewers);
    setNetwork(product.network);
    setFormError(null);
    setOwnerError(null);
    resetAssets();
    setEditorVersion((version) => version + 1);
  }, [product?.id, product?.updated_at, resetAssets]);

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
    if (!ownerId) {
      setOwnerError(t("workspace_products.validation.owner_required"));
      return;
    }

    setIsSaving(true);
    setFormError(null);
    setOwnerError(null);
    try {
      const savedProduct = await updateProduct(product.id, {
        name: trimmedName,
        description_html: descriptionHTML,
        network,
        owner: ownerId,
        reviewers: reviewerIds,
      });
      await commitAssets(descriptionHTML);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.toast.updated"),
      });

      const canStillManage = hasWorkspaceAdminAccess || savedProduct.owner === currentUser?.id;
      if (!canStillManage) {
        const canStillView = savedProduct.network === 2 || savedProduct.reviewers.includes(currentUser?.id ?? "");
        navigate(canStillView ? `/${workspaceSlug}/products/${productId}/dashboard` : `/${workspaceSlug}/products`, {
          replace: true,
        });
      }
    } catch (error) {
      const errorPayload = error && typeof error === "object" ? (error as { name?: string[]; owner?: string[] }) : {};
      if (errorPayload.owner?.[0]) setOwnerError(String(errorPayload.owner[0]));
      else setFormError(String(errorPayload.name?.[0] ?? t("workspace_products.toast.failed")));
    } finally {
      setIsSaving(false);
    }
  };

  const createdAt = renderFormattedDate(product.created_at);

  return (
    <SettingsContentWrapper header={<ProductSettingsHeader settingsKey="general" />}>
      <PageHead title={`${t("workspace_products.settings.navigation.general")} - ${product.name}`} />

      <div className="w-full">
        <div className="space-y-6">
          <div>
            <label htmlFor="product-settings-name" className="mb-1.5 block text-body-sm-medium text-primary">
              {t("workspace_products.settings.fields.name")}
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

          <div>
            <p className="mb-1.5 text-body-sm-medium text-primary">
              {t("workspace_products.settings.fields.description")}
            </p>
            {!workspaceId ? (
              <Loader>
                <Loader.Item height="190px" />
              </Loader>
            ) : (
              <div className="min-h-[190px] overflow-hidden rounded-md border border-subtle bg-surface-1">
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
                  containerClassName="min-h-[190px] pr-3 pt-3 text-13"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
            <div>
              <p className="mb-1.5 text-body-sm-medium text-primary">{t("workspace_products.settings.fields.owner")}</p>
              <div className="h-10 w-full">
                <MemberDropdown
                  multiple={false}
                  value={ownerId}
                  onChange={(value) => {
                    setOwnerId(value);
                    setOwnerError(null);
                  }}
                  buttonVariant="border-with-text"
                  className="h-full w-full"
                  buttonClassName="h-full w-full border !border-subtle bg-surface-1"
                  buttonContainerClassName="h-full w-full"
                  placeholder={t("workspace_products.validation.owner_required")}
                  showUserDetails
                />
              </div>
              {ownerError && <p className="mt-1.5 text-caption-md-regular text-danger-primary">{ownerError}</p>}
            </div>

            <div>
              <p className="mb-1.5 text-body-sm-medium text-primary">
                {t("workspace_products.settings.fields.visibility")}
              </p>
              <div className="h-10 w-full">
                <CustomSelect
                  value={network}
                  onChange={(value: TProductNetwork) => setNetwork(value)}
                  className="h-full w-full"
                  buttonClassName="h-full !border-subtle bg-surface-1 py-0"
                  optionsClassName="w-[min(24rem,calc(100vw-2rem))]"
                  label={
                    <span className="flex min-w-0 items-center gap-2 text-body-sm-regular text-primary">
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
                        <p className="text-11 font-medium text-primary">{t("workspace_products.visibility.public")}</p>
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
                        <p className="text-11 font-medium text-primary">{t("workspace_products.visibility.private")}</p>
                        <p className="mt-0.5 text-11 leading-4 text-secondary">
                          {t("workspace_products.visibility.private_description")}
                        </p>
                      </div>
                    </div>
                  </CustomSelect.Option>
                </CustomSelect>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-body-sm-medium text-primary">
              {t("workspace_products.settings.fields.reviewers")}
            </p>
            <MemberDropdown
              multiple
              value={reviewerIds}
              onChange={setReviewerIds}
              buttonVariant="border-with-text"
              buttonClassName="h-10 w-full border !border-subtle bg-surface-1"
              buttonContainerClassName="w-full"
              placeholder={t("workspace_products.fields.reviewers")}
              showUserDetails
            />
          </div>

          {willLosePrivateAccess && (
            <div className="flex items-start gap-2 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2.5 text-caption-md-regular text-warning-primary">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{t("workspace_products.visibility.private_access_warning")}</span>
            </div>
          )}

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
