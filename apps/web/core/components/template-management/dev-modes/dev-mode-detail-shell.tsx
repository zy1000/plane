import { useState } from "react";
import { observer } from "mobx-react";
import { Outlet } from "react-router";
import { Pencil, Workflow } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { DEV_MODE_FEATURE_KEYS } from "@plane/types";
import { Breadcrumbs, Header, Loader } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { toTypeIconProps, TypeIcon } from "@/components/common/type-icon-picker";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useTemplatePermissions } from "../permissions";
import { useDevModeDetailContext } from "./context";
import { DevModeDetailHeader } from "./dev-mode-detail-header";
import { DevModeFormModal, type TDevModeFormValue } from "./dev-mode-form-modal";
import { DevModeSubNav } from "./dev-mode-sub-nav";
import { devModesBasePath } from "./routes";
import { DEV_MODE_I18N } from "./dev-modes-grid";

/**
 * 模式详情的外壳：顶栏面包屑 + 头部身份区 + 子页签，中间用 Outlet 装当前子页。
 *
 * 数据由 DevModeDetailProvider（挂在 layout 路由上）提供，所以切页签不会重新拉一次
 * 详情；头部和页签计数在两个子页之间是同一份。
 */
export const DevModeDetailShell = observer(function DevModeDetailShell() {
  const { t } = useTranslation();
  const { workspaceSlug, devModeId, devMode, isLoading, isMutating, error, fetchDevMode, updateDevMode } =
    useDevModeDetailContext();
  const { canManageDevModes } = useTemplatePermissions(workspaceSlug);
  const [isEditingMode, setIsEditingMode] = useState(false);

  const handleModeSubmit = async (value: TDevModeFormValue) => {
    if (!devMode) return;
    const payload = {
      description: value.description,
      icon_props: { in_use: "icon" as const, icon: toTypeIconProps(value.icon) },
      features: value.features,
    };
    // 预置模式的名称是只读的，别把原值再发一遍触发后端的只读校验
    await updateDevMode(devMode.is_system ? payload : { ...payload, name: value.name });
    setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.updated`) });
    setIsEditingMode(false);
  };

  if (isLoading) {
    return (
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1 p-6">
        <Loader className="flex flex-col gap-4">
          <Loader.Item height="60px" />
          <Loader.Item height="40px" />
          <Loader.Item height="400px" />
        </Loader>
      </ContentWrapper>
    );
  }

  if (error || !devMode) {
    return (
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1 p-6">
        <div className="rounded-lg border border-subtle p-10 text-center">
          <p className="text-13 font-medium text-primary">{t(`${DEV_MODE_I18N}.error_title`)}</p>
          {error && <p className="mt-1 text-12 text-secondary">{error}</p>}
          <Button
            className="mt-4"
            variant="secondary"
            size="lg"
            onClick={() => void fetchDevMode().catch(() => undefined)}
          >
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
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      href={devModesBasePath(workspaceSlug)}
                      label={t(`${DEV_MODE_I18N}.title`)}
                      icon={<Workflow className="size-4 text-secondary" />}
                    />
                  }
                />
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={devMode.name}
                      icon={<TypeIcon iconProps={devMode.icon_props?.icon} className="size-4" iconClassName="size-3" />}
                      isLast
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            {canManageDevModes && (
              <Header.RightItem className="gap-2">
                <Button variant="secondary" onClick={() => setIsEditingMode(true)}>
                  <Pencil className="size-3.5" />
                  {t(`${DEV_MODE_I18N}.detail.edit_mode`)}
                </Button>
              </Header.RightItem>
            )}
          </Header>
        }
      />

      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        <DevModeDetailHeader devMode={devMode} />
        <div className="mt-4 shrink-0">
          <DevModeSubNav
            workspaceSlug={workspaceSlug}
            devModeId={devModeId}
            stageCount={devMode.stage_count}
            featureOnCount={featureOnCount}
            featureTotal={DEV_MODE_FEATURE_KEYS.length}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </div>
      </ContentWrapper>

      <DevModeFormModal
        isOpen={isEditingMode}
        devMode={devMode}
        isSubmitting={isMutating}
        onClose={() => setIsEditingMode(false)}
        onSubmit={handleModeSubmit}
      />
    </>
  );
});
