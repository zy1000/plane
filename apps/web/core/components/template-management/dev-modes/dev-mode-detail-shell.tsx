import { useState } from "react";
import { observer } from "mobx-react";
import { Outlet, useNavigate } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { DEV_MODE_FEATURE_KEYS } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { toTypeIconProps } from "@/components/common/type-icon-picker";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useTemplatePermissions } from "../permissions";
import { useTemplateCenter } from "../template-center-context";
import { useDevModeDetailContext } from "./context";
import { DevModeDetailHeader } from "./dev-mode-detail-header";
import { DevModeFormModal, type TDevModeFormValue } from "./dev-mode-form-modal";
import { DevModeSubNav } from "./dev-mode-sub-nav";
import { DEV_MODE_I18N } from "./dev-modes-grid";
import { devModesBasePath } from "./routes";

/**
 * 模式页外壳（方案 A）：身份头 + 一层页签，中间用 Outlet 装当前子页。
 *
 * 数据由 DevModeDetailProvider（挂在 layout 路由上）提供，切页签不重拉；
 * 改名、删除后通过模板中心 context 刷新左栏。
 */
export const DevModeDetailShell = observer(function DevModeDetailShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    workspaceSlug,
    devModeId,
    devMode,
    isLoading,
    isMutating,
    error,
    fetchDevMode,
    updateDevMode,
    issueTypesStore,
    schemeViewsStore,
  } = useDevModeDetailContext();
  const { modes } = useTemplateCenter();
  const { canManageDevModes } = useTemplatePermissions(workspaceSlug);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleEditSubmit = async (value: TDevModeFormValue) => {
    if (!devMode) return;
    const payload = {
      description: value.description,
      icon_props: { in_use: "icon" as const, icon: toTypeIconProps(value.icon) },
      features: value.features,
    };
    // 预置模式的名称是只读的，别把原值再发一遍触发后端的只读校验
    await updateDevMode(devMode.is_system ? payload : { ...payload, name: value.name });
    setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.updated`) });
    setIsEditing(false);
    void modes.fetchDevModes().catch(() => undefined);
  };

  const handleDelete = async () => {
    if (!devMode) return;
    setIsDeleting(true);
    try {
      await modes.deleteDevMode(devModeId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.deleted`) });
      navigate(devModesBasePath(workspaceSlug), { replace: true });
    } catch (deleteError) {
      const payload = deleteError as { code?: string; error?: string } | undefined;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(`${DEV_MODE_I18N}.toast.delete_failed`, { name: devMode.name }),
        message:
          payload?.code === "DEV_MODE_IN_USE"
            ? t(`${DEV_MODE_I18N}.errors.dev_mode_in_use`)
            : payload?.code === "DEV_MODE_IN_USE_BY_INACTIVE_PROJECTS"
              ? t(`${DEV_MODE_I18N}.errors.dev_mode_in_use_by_inactive_projects`)
              : (payload?.error ?? t(`${DEV_MODE_I18N}.errors.generic`)),
      });
      setIsDeleteOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1 p-7">
        <Loader className="flex flex-col gap-4">
          <Loader.Item height="56px" width="40%" />
          <Loader.Item height="40px" />
          <Loader.Item height="400px" />
        </Loader>
      </ContentWrapper>
    );
  }

  if (error || !devMode) {
    return (
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1 p-7">
        <div className="rounded-lg border border-subtle p-10 text-center">
          <p className="text-13 font-medium text-primary">{t(`${DEV_MODE_I18N}.error_title`)}</p>
          {error && <p className="mt-1 text-12 text-secondary">{error}</p>}
          <Button className="mt-4" variant="secondary" size="lg" onClick={() => void fetchDevMode().catch(() => undefined)}>
            {t("retry")}
          </Button>
        </div>
      </ContentWrapper>
    );
  }

  const featureOnCount = DEV_MODE_FEATURE_KEYS.filter((key) => devMode.features?.[key]).length;

  return (
    <>
      <PageHead title={devMode.name} />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        <DevModeDetailHeader
          devMode={devMode}
          canEdit={canManageDevModes}
          onEdit={() => setIsEditing(true)}
          onDelete={() => setIsDeleteOpen(true)}
        />
        <div className="mt-3.5 shrink-0">
          <DevModeSubNav
            workspaceSlug={workspaceSlug}
            devModeId={devModeId}
            stageCount={devMode.stages.length}
            typeCount={issueTypesStore.issueTypes?.length}
            viewCount={schemeViewsStore.views?.length}
            featureOnCount={featureOnCount}
            featureTotal={DEV_MODE_FEATURE_KEYS.length}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </div>
      </ContentWrapper>

      <DevModeFormModal
        isOpen={isEditing}
        devMode={devMode}
        isSubmitting={isMutating}
        onClose={() => setIsEditing(false)}
        onSubmit={handleEditSubmit}
      />

      <AlertModalCore
        isOpen={isDeleteOpen}
        variant="danger"
        isSubmitting={isDeleting}
        handleClose={() => setIsDeleteOpen(false)}
        handleSubmit={() => void handleDelete()}
        title={t(`${DEV_MODE_I18N}.delete_modal.title`, { name: devMode.name })}
        content={t(`${DEV_MODE_I18N}.delete_modal.description`)}
        primaryButtonText={{
          default: t(`${DEV_MODE_I18N}.delete_modal.confirm`),
          loading: t(`${DEV_MODE_I18N}.delete_modal.deleting`),
        }}
        secondaryButtonText={t("cancel")}
      />
    </>
  );
});
