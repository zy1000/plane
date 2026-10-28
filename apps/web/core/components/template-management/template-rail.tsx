import { useState } from "react";
import { observer } from "mobx-react";
import { Link, useLocation, useNavigate } from "react-router";
import { Info, Lock, Plus, TableProperties } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { DEFAULT_DEV_MODE_NAME } from "@plane/types";
import { Loader, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import { toTypeIconProps, TypeIcon } from "@/components/common/type-icon-picker";
import { useUserPermissions } from "@/hooks/store/user";
import { DevModeFormModal, type TDevModeFormValue } from "./dev-modes/dev-mode-form-modal";
import { DEV_MODE_I18N } from "./dev-modes/dev-modes-grid";
import { devModeDetailPath, devModesBasePath } from "./dev-modes/routes";
import { getTemplateManagementTabPath, TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS } from "./navigation";
import { useTemplatePermissions } from "./permissions";
import { useTemplateCenter } from "./template-center-context";

const normalize = (path: string) => path.replace(/\/+$/, "");

const ITEM =
  "flex h-9 items-center gap-2.5 rounded-lg px-2 text-14 transition-colors hover:bg-layer-transparent-hover hover:text-primary";
const ITEM_ACTIVE = "bg-layer-1-selected font-semibold text-primary";

function RailLink({ href, icon: Icon, label, isActive }: { href: string; icon: LucideIcon; label: string; isActive: boolean }) {
  return (
    <Link to={href} className={cn(ITEM, isActive ? ITEM_ACTIVE : "text-secondary")}>
      <Icon className={cn("size-4 shrink-0", isActive ? "text-accent-primary" : "text-tertiary")} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * 模板中心左栏（方案 A）：资产库各项 + 研发模式逐个列出。
 *
 * 顶部页签撤掉后，模板中心各页之间都靠它切换；研发模式不再有「列表页 → 详情页」那一跳，
 * 点模式名直接进模式页，「全部模式对比」是原来的列表页。
 */
export const TemplateRail = observer(function TemplateRail({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const { canViewDevModes, canManageDevModes } = useTemplatePermissions(workspaceSlug);
  const { modes } = useTemplateCenter();
  const [isCreating, setIsCreating] = useState(false);

  const current = normalize(pathname);
  const assets = TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS.filter(
    (item) => item.key !== "dev-modes" && allowWorkspacePermissionKeys(item.permissionKeys, workspaceSlug)
  );

  const handleCreate = async (value: TDevModeFormValue) => {
    const created = await modes.createDevMode({
      name: value.name,
      description: value.description,
      icon_props: { in_use: "icon" as const, icon: toTypeIconProps(value.icon) },
      features: value.features,
    });
    setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.created`) });
    setIsCreating(false);
    if (created) navigate(devModeDetailPath(workspaceSlug, created.id));
  };

  return (
    <nav className="flex h-full w-[240px] shrink-0 flex-col border-r border-subtle bg-surface-2 px-3 pb-3 pt-4">
      <div className="px-2 pb-2 text-16 font-semibold text-primary">{t("workspace_templates.title")}</div>

      {assets.length > 0 && (
        <>
          <div className="px-2 pb-1.5 pt-4 text-12 font-medium text-tertiary">资产库</div>
          <div className="flex flex-col gap-0.5">
            {assets.map((item) => {
              const href = getTemplateManagementTabPath(workspaceSlug, item.key);
              return (
                <RailLink
                  key={item.key}
                  href={href}
                  icon={item.icon}
                  label={item.i18nKey ? t(item.i18nKey) : (item.label ?? item.key)}
                  isActive={current === href || current.startsWith(`${href}/`)}
                />
              );
            })}
          </div>
        </>
      )}

      {canViewDevModes && (
        <>
          <div className="flex items-center justify-between pb-1.5 pl-2 pr-1 pt-5 text-12 font-medium text-tertiary">
            <span>{t(`${DEV_MODE_I18N}.title`)}</span>
            {canManageDevModes && (
              <Tooltip tooltipContent={t(`${DEV_MODE_I18N}.create`)} position="right">
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="grid size-6 place-items-center rounded text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
                  aria-label={t(`${DEV_MODE_I18N}.create`)}
                >
                  <Plus className="size-3.5" />
                </button>
              </Tooltip>
            )}
          </div>
          <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            <RailLink
              href={devModesBasePath(workspaceSlug)}
              icon={TableProperties}
              label="全部模式对比"
              isActive={current === devModesBasePath(workspaceSlug)}
            />
            {modes.isLoading ? (
              <Loader className="flex flex-col gap-1 px-1 pt-1">
                {[0, 1, 2].map((index) => (
                  <Loader.Item key={index} height="30px" />
                ))}
              </Loader>
            ) : (
              modes.devModes.map((mode) => {
                const href = devModeDetailPath(workspaceSlug, mode.id);
                const isActive = current === href || current.startsWith(`${href}/`);
                const isDefault = mode.is_system && mode.name === DEFAULT_DEV_MODE_NAME;
                return (
                  <Link key={mode.id} to={href} className={cn(ITEM, isActive ? ITEM_ACTIVE : "text-secondary")}>
                    <TypeIcon iconProps={mode.icon_props?.icon} className="size-6 rounded-[7px]" iconClassName="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">{mode.name}</span>
                    {isDefault && (
                      <span className="shrink-0 rounded border border-accent-subtle bg-accent-subtle px-1 text-11 font-medium leading-4 text-accent-primary">
                        默认
                      </span>
                    )}
                    {mode.is_system && (
                      <Tooltip tooltipContent={t(`${DEV_MODE_I18N}.card.preset`)} position="right">
                        <Lock className="size-3.5 shrink-0 text-placeholder" aria-label={t(`${DEV_MODE_I18N}.card.preset`)} />
                      </Tooltip>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-subtle px-2 pt-3 text-12 text-tertiary">
        <Info className="size-3.5 shrink-0" />
        <span>
          阶段类型在{" "}
          <Link
            to={`/${workspaceSlug}/settings/stage-types`}
            className="text-link-primary hover:text-link-primary-hover"
          >
            工作区设置
          </Link>{" "}
          维护
        </span>
      </div>

      <DevModeFormModal
        isOpen={isCreating}
        devMode={null}
        isSubmitting={modes.isMutating}
        onClose={() => setIsCreating(false)}
        onSubmit={handleCreate}
      />
    </nav>
  );
});
