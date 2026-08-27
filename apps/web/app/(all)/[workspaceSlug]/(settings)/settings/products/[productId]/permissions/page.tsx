import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { PageHead } from "@/components/core/page-title";
import { ProductSettingsHeader } from "@/components/products/settings/header";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { RolesSidebar, type TRolesSidebarLabels } from "@/components/workspace/settings/roles/roles-sidebar";
import { useProductRoles } from "@/hooks/store/use-product-roles";

export default function ProductPermissionsSettingsPage() {
  const { t } = useTranslation();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug?.toString();
  const productId = params.productId?.toString();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const { roles, isLoading, error, fetchRoles, createRole, updateRole, deleteRole } = useProductRoles(
    workspaceSlug,
    productId
  );

  useEffect(() => {
    if (roles.length === 0) {
      if (!isLoading) setSelectedRoleId(null);
      return;
    }
    if (selectedRoleId === null || !roles.some((role) => role.id === selectedRoleId)) {
      setSelectedRoleId(roles[0].id);
    }
  }, [isLoading, roles, selectedRoleId]);

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
          isAdmin
          selectedRoleId={selectedRoleId}
          onSelectRole={setSelectedRoleId}
          onCreate={async (data) => createRole(data)}
          onUpdate={async (roleId, data) => {
            await updateRole(roleId, data);
          }}
          onDelete={handleDelete}
          labels={labels}
        />

        <div className="min-w-0 flex-1 bg-surface-1" aria-hidden="true" />
      </section>
    </SettingsContentWrapper>
  );
}
