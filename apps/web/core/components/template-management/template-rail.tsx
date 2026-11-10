import { useState } from "react";
import { observer } from "mobx-react";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft, Info, Lock, PanelLeft, Plus, TableProperties } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocalStorage } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
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

/** 收起状态记在本机，和工作区侧栏的收起互不影响 */
const RAIL_COLLAPSED_STORAGE_KEY = "template_center_rail_collapsed";

const ITEM =
  "flex h-9 items-center gap-2.5 rounded-lg px-2 text-14 transition-colors hover:bg-layer-transparent-hover hover:text-primary";
const ITEM_ACTIVE = "bg-layer-1-selected font-semibold text-primary";

/** 收起后的图标格：与工作区侧栏收起态同为 32×32 */
const ICON_ITEM = "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors";
const ICON_ITEM_IDLE = "text-tertiary hover:bg-layer-transparent-hover hover:text-primary";
const ICON_ITEM_ACTIVE = "bg-layer-1-selected text-accent-primary";

function RailLink({ href, icon: Icon, label, isActive }: { href: string; icon: LucideIcon; label: string; isActive: boolean }) {
  return (
    <Link to={href} className={cn(ITEM, isActive ? ITEM_ACTIVE : "text-secondary")}>
      <Icon className={cn("size-4 shrink-0", isActive ? "text-accent-primary" : "text-tertiary")} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function RailIconLink({ href, icon: Icon, label, isActive }: { href: string; icon: LucideIcon; label: string; isActive: boolean }) {
  return (
    <Tooltip tooltipContent={label} position="right">
      <Link to={href} aria-label={label} className={cn(ICON_ITEM, isActive ? ICON_ITEM_ACTIVE : ICON_ITEM_IDLE)}>
        <Icon className="size-4" />
      </Link>
    </Tooltip>
  );
}

/**
 * 模板中心左栏：资产库各项 + 研发模式逐个列出。
 *
 * 照工作区设置的做法接管工作区侧栏（进模板中心后工作区侧栏不渲染），顶上的返回箭头回工作区；
 * 可以收起成图标条，库内页这类自带模块树的页面嫌挤时用。
 * 研发模式没有「列表页 → 详情页」那一跳，点模式名直接进模式页，「全部模式对比」是原来的列表页。
 */
export const TemplateRail = observer(function TemplateRail({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const { canViewDevModes, canManageDevModes } = useTemplatePermissions(workspaceSlug);
  const { modes } = useTemplateCenter();
  const { storedValue, setValue: setIsCollapsed } = useLocalStorage<boolean>(RAIL_COLLAPSED_STORAGE_KEY, false);
  const [isCreating, setIsCreating] = useState(false);

  const isCollapsed = storedValue === true;
  const current = normalize(pathname);
  const isUnder = (href: string) => current === href || current.startsWith(`${href}/`);
  const assets = TEMPLATE_MANAGEMENT_NAVIGATION_ITEMS.filter(
    (item) => item.key !== "dev-modes" && allowWorkspacePermissionKeys(item.permissionKeys, workspaceSlug)
  ).map((item) => {
    const href = getTemplateManagementTabPath(workspaceSlug, item.key);
    return {
      key: item.key,
      href,
      icon: item.icon,
      label: item.i18nKey ? t(item.i18nKey) : (item.label ?? item.key),
      isActive: isUnder(href),
    };
  });
  const overviewHref = devModesBasePath(workspaceSlug);
  const devModeLinks = modes.devModes.map((mode) => {
    const href = devModeDetailPath(workspaceSlug, mode.id);
    return { mode, href, isActive: isUnder(href) };
  });

  const goToWorkspace = () => navigate(`/${workspaceSlug}/`);

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

  const renderCollapsed = () => (
    <div className="flex h-full w-[52px] flex-col items-center gap-1 px-1.5 pb-3 pt-3">
      <Tooltip tooltipContent="展开侧栏" position="right">
        <IconButton variant="ghost" size="base" icon={PanelLeft} aria-label="展开侧栏" onClick={() => setIsCollapsed(false)} />
      </Tooltip>
      <Tooltip tooltipContent="返回工作区" position="right">
        <IconButton variant="ghost" size="base" icon={ArrowLeft} aria-label="返回工作区" onClick={goToWorkspace} />
      </Tooltip>

      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto [scrollbar-width:none]">
        {assets.length > 0 && (
          <>
            <hr className="my-1.5 w-full shrink-0 border-subtle" />
            {assets.map(({ key, ...item }) => (
              <RailIconLink key={key} {...item} />
            ))}
          </>
        )}
        {canViewDevModes && (
          <>
            <hr className="my-1.5 w-full shrink-0 border-subtle" />
            <RailIconLink href={overviewHref} icon={TableProperties} label="全部模式对比" isActive={current === overviewHref} />
            {devModeLinks.map(({ mode, href, isActive }) => (
              <Tooltip key={mode.id} tooltipContent={mode.name} position="right">
                <Link
                  to={href}
                  aria-label={mode.name}
                  className={cn(ICON_ITEM, isActive ? "bg-layer-1-selected" : "hover:bg-layer-transparent-hover")}
                >
                  <TypeIcon iconProps={mode.icon_props?.icon} className="size-6 rounded-[7px]" iconClassName="size-3.5" />
                </Link>
              </Tooltip>
            ))}
          </>
        )}
      </div>
    </div>
  );

  const renderExpanded = () => (
    <div className="flex h-full w-[220px] flex-col px-3 pb-3 pt-3">
      <div className="flex items-center gap-1 pb-1">
        <Tooltip tooltipContent="返回工作区" position="bottom">
          <IconButton variant="ghost" size="base" icon={ArrowLeft} aria-label="返回工作区" onClick={goToWorkspace} />
        </Tooltip>
        <span className="min-w-0 flex-1 truncate text-16 font-semibold text-primary">{t("workspace_templates.title")}</span>
        <Tooltip tooltipContent="收起侧栏" position="bottom">
          <IconButton variant="ghost" size="base" icon={PanelLeft} aria-label="收起侧栏" onClick={() => setIsCollapsed(true)} />
        </Tooltip>
      </div>

      {assets.length > 0 && (
        <>
          <div className="px-2 pb-1.5 pt-4 text-12 font-medium text-tertiary">资产库</div>
          <div className="flex flex-col gap-0.5">
            {assets.map(({ key, ...item }) => (
              <RailLink key={key} {...item} />
            ))}
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
            <RailLink href={overviewHref} icon={TableProperties} label="全部模式对比" isActive={current === overviewHref} />
            {modes.isLoading ? (
              <Loader className="flex flex-col gap-1 px-1 pt-1">
                {[0, 1, 2].map((index) => (
                  <Loader.Item key={index} height="30px" />
                ))}
              </Loader>
            ) : (
              devModeLinks.map(({ mode, href, isActive }) => {
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
          <Link to={`/${workspaceSlug}/settings/stage-types`} className="text-link-primary hover:text-link-primary-hover">
            工作区设置
          </Link>{" "}
          维护
        </span>
      </div>
    </div>
  );

  return (
    <nav
      aria-label={t("workspace_templates.title")}
      className={cn(
        "h-full shrink-0 overflow-hidden border-r border-subtle bg-surface-2 transition-[width] duration-200",
        isCollapsed ? "w-[52px]" : "w-[220px]"
      )}
    >
      {isCollapsed ? renderCollapsed() : renderExpanded()}

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
