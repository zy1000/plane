import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import { Search, X } from "lucide-react";
import { PRODUCT_ROLE_MANAGE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IWorkspaceRole } from "@plane/types";
import { cn } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { useProductsContext } from "@/components/products/context";
import { hasProductPermission } from "@/components/products/permissions";
import { ProductSettingsHeader } from "@/components/products/settings/header";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import {
  getPermissionScopeSummary,
  PermissionsPanel,
  type PermissionScope,
} from "@/components/workspace/settings/roles/permissions-panel";
import { RolesSidebar, type TRolesSidebarLabels } from "@/components/workspace/settings/roles/roles-sidebar";
import { useProductRoles } from "@/hooks/store/use-product-roles";

const ProductPermissionsSettingsPage = observer(function ProductPermissionsSettingsPage() {
  const { t } = useTranslation();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug?.toString();
  const productId = params.productId?.toString();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeScope, setActiveScope] = useState<PermissionScope>("product");

  const { products } = useProductsContext();
  const product = products.find(({ id }) => id === productId);
  // 产品内的角色是一把权限管建 / 改 / 删和配权限；读角色列表任何能看见产品的人都行
  const canManageRoles = hasProductPermission(product, PRODUCT_ROLE_MANAGE_PERMISSION_KEY);

  const {
    roles,
    isLoading,
    error,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    loadRolePermissions,
    getRolePermissionState,
    togglePermission,
  } = useProductRoles(workspaceSlug, productId);

  useEffect(() => {
    if (roles.length === 0) {
      if (!isLoading) setSelectedRoleId(null);
      return;
    }
    if (selectedRoleId === null || !roles.some((role) => role.id === selectedRoleId)) {
      setSelectedRoleId(roles[0].id);
    }
  }, [isLoading, roles, selectedRoleId]);

  useEffect(() => {
    if (selectedRoleId !== null) void loadRolePermissions(selectedRoleId);
  }, [selectedRoleId, loadRolePermissions]);

  // 回到前台时重拉一次：别人可能在另一个标签页改过这个角色
  useEffect(() => {
    if (selectedRoleId === null) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadRolePermissions(selectedRoleId);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [selectedRoleId, loadRolePermissions]);

  const labels = useMemo<Partial<TRolesSidebarLabels>>(
    () => ({
      title: t("workspace_products.settings.permissions.roles"),
      create: t("workspace_products.settings.permissions.create"),
      searchPlaceholder: t("workspace_products.settings.permissions.search"),
      noResults: t("workspace_products.settings.permissions.no_results"),
      empty: t("workspace_products.settings.permissions.empty"),
      createInline: t("workspace_products.settings.permissions.create_inline"),
      edit: t("workspace_products.settings.permissions.edit"),
      delete: t("workspace_products.settings.permissions.delete"),
      loadFailed: t("workspace_products.settings.permissions.load_failed"),
      retry: t("retry"),
      createdTitle: t("workspace_products.settings.permissions.created_title"),
      createdMessage: (name) => t("workspace_products.settings.permissions.created_message", { name }),
      savedTitle: t("workspace_products.settings.permissions.saved_title"),
      savedMessage: t("workspace_products.settings.permissions.saved_message"),
      deletedTitle: t("workspace_products.settings.permissions.deleted_title"),
      deletedMessage: (name) => t("workspace_products.settings.permissions.deleted_message", { name }),
      deleteFailedTitle: t("workspace_products.settings.permissions.delete_failed"),
      tryAgain: t("workspace_products.settings.permissions.try_again"),
      deleteConfirmTitle: t("workspace_products.settings.permissions.delete_confirm_title"),
      deleteConfirmDescription: (name) =>
        t("workspace_products.settings.permissions.delete_confirm_description", { name }),
      cancel: t("cancel"),
      deleting: t("workspace_products.settings.permissions.deleting"),
      form: {
        createTitle: t("workspace_products.settings.permissions.form.create_title"),
        editTitle: t("workspace_products.settings.permissions.form.edit_title"),
        nameLabel: t("workspace_products.settings.permissions.form.name"),
        namePlaceholder: t("workspace_products.settings.permissions.form.name_placeholder"),
        descriptionLabel: t("workspace_products.settings.permissions.form.description"),
        descriptionPlaceholder: t("workspace_products.settings.permissions.form.description_placeholder"),
        close: t("close"),
        cancel: t("cancel"),
        create: t("workspace_products.settings.permissions.form.create_action"),
        save: t("save_changes"),
      },
    }),
    [t]
  );

  const selectedRole = selectedRoleId !== null ? (roles.find((role) => role.id === selectedRoleId) ?? null) : null;
  const rolePermissionState = selectedRoleId !== null ? getRolePermissionState(selectedRoleId) : null;
  const activeScopeSummary = useMemo(
    () =>
      getPermissionScopeSummary(
        rolePermissionState?.data?.permissions ?? [],
        rolePermissionState?.data?.permission_keys ?? [],
        activeScope
      ),
    [rolePermissionState?.data?.permissions, rolePermissionState?.data?.permission_keys, activeScope]
  );

  const handleSelectRole = (roleId: number) => {
    setSelectedRoleId(roleId);
    setSearchQuery("");
  };

  const handleDelete = async (roleId: number) => {
    const roleIndex = roles.findIndex((role) => role.id === roleId);
    const nextRoleId = roles[roleIndex + 1]?.id ?? roles[roleIndex - 1]?.id ?? null;
    await deleteRole(roleId);
    if (selectedRoleId === roleId) setSelectedRoleId(nextRoleId);
  };

  return (
    <SettingsContentWrapper header={<ProductSettingsHeader settingsKey="permissions" />} hugging>
      <PageHead title={t("workspace_products.settings.navigation.permissions")} />

      <p className="mb-4 text-13 leading-4 font-medium text-tertiary">
        {t("workspace_products.settings.permissions.description")}
      </p>

      <section className="flex h-[calc(100svh-12rem)] min-h-[520px] w-full overflow-hidden rounded-lg border border-subtle bg-surface-1">
        <RolesSidebar
          roles={roles}
          totalRoleCount={roles.length}
          isLoading={isLoading}
          error={error}
          onRetry={() => void fetchRoles().catch(() => undefined)}
          isAdmin={canManageRoles}
          canCreate={canManageRoles}
          canEdit={canManageRoles}
          canDelete={canManageRoles}
          canImport={false}
          selectedRoleId={selectedRoleId}
          onSelectRole={handleSelectRole}
          onCreate={async (data) => createRole(data)}
          onUpdate={async (roleId, data) => {
            await updateRole(roleId, data);
          }}
          onDelete={handleDelete}
          labels={labels}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedRole && (
            <div className="flex shrink-0 items-center gap-4 border-b border-subtle bg-surface-1 px-6 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-13 leading-4 font-medium text-primary">{selectedRole.name}</h2>
                  {!searchQuery && activeScopeSummary.totalPermissions > 0 && (
                    <span className="shrink-0 rounded-full bg-accent-primary/10 px-2 py-0.5 text-13 leading-4 font-medium text-accent-primary tabular-nums">
                      {activeScopeSummary.totalBound}/{activeScopeSummary.totalPermissions}
                    </span>
                  )}
                </div>
                {selectedRole.description?.trim() && (
                  <p className="truncate text-13 leading-4 font-medium text-tertiary">{selectedRole.description}</p>
                )}
              </div>
              <div
                className={cn(
                  "flex w-52 shrink-0 items-center gap-1.5 rounded-md border py-1.5 pr-1.5 pl-2.5 transition-colors duration-150",
                  searchQuery
                    ? "border-accent-primary/40 bg-accent-primary/4"
                    : "focus-within:border-accent-primary/40 border-subtle bg-surface-2 focus-within:bg-surface-1"
                )}
              >
                <Search className={cn("size-3.5 shrink-0", searchQuery ? "text-accent-primary" : "text-placeholder")} />
                <input
                  type="text"
                  className="min-w-0 flex-1 border-none bg-transparent text-13 leading-4 font-medium outline-none placeholder:text-placeholder"
                  placeholder={t("workspace_products.settings.permissions.search_permissions")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="flex size-4 cursor-pointer items-center justify-center rounded text-placeholder transition-colors hover:bg-layer-1-hover hover:text-primary"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            {/* PermissionsPanel 的 role 类型是工作区角色；RolesSidebar 已是泛型，这里照项目页强转 */}
            <PermissionsPanel
              role={selectedRole as unknown as IWorkspaceRole}
              permissions={rolePermissionState?.data?.permissions ?? []}
              permissionKeys={rolePermissionState?.data?.permission_keys ?? []}
              isLoading={Boolean(
                selectedRoleId !== null &&
                !rolePermissionState?.data &&
                (rolePermissionState?.isLoading || !rolePermissionState?.loaded)
              )}
              isAdmin={canManageRoles}
              searchQuery={searchQuery}
              onTogglePermission={(roleId, permissionKey) => togglePermission(Number(roleId), permissionKey)}
              activeScope={activeScope}
              onActiveScopeChange={setActiveScope}
            />
          </div>
        </div>
      </section>
    </SettingsContentWrapper>
  );
});

export default ProductPermissionsSettingsPage;
