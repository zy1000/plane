/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, CircleMinus, Copy, Search, ShieldCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Accordion } from "@plane/propel/accordion";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspaceMyAccessPermission, IWorkspaceMyAccessPermissionSource } from "@plane/types";
import { Button, CustomSelect, Input } from "@plane/ui";
import { cn, copyTextToClipboard } from "@plane/utils";
import { comparePermissionCategories, comparePermissions } from "@/components/workspace/settings/roles/permission-sort";

type TPermissionSourceFilter = "all" | "direct_role" | "group_role" | "privileged" | "not_granted";

type Props = {
  permissions: IWorkspaceMyAccessPermission[];
};

const FILTER_I18N_KEYS: Record<TPermissionSourceFilter, string> = {
  all: "workspace_settings.settings.my_access.permissions.filters.all",
  direct_role: "workspace_settings.settings.my_access.permissions.filters.direct_role",
  group_role: "workspace_settings.settings.my_access.permissions.filters.group_role",
  privileged: "workspace_settings.settings.my_access.permissions.filters.privileged",
  not_granted: "workspace_settings.settings.my_access.permissions.filters.not_granted",
};

export function MyAccessPermissionsList({ permissions }: Props) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<TPermissionSourceFilter>("all");

  const availableFilters = useMemo<TPermissionSourceFilter[]>(() => {
    const sourceTypes = new Set(permissions.flatMap((permission) => permission.sources.map((source) => source.type)));
    const filters: TPermissionSourceFilter[] = ["all"];
    if (sourceTypes.has("direct_role")) filters.push("direct_role");
    if (sourceTypes.has("group_role")) filters.push("group_role");
    if (sourceTypes.has("workspace_owner") || sourceTypes.has("instance_admin")) filters.push("privileged");
    if (permissions.some((permission) => !permission.is_granted)) filters.push("not_granted");
    return filters;
  }, [permissions]);

  useEffect(() => {
    if (!availableFilters.includes(sourceFilter)) setSourceFilter("all");
  }, [availableFilters, sourceFilter]);

  const filteredPermissions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    return permissions.filter((permission) => {
      const matchesSearch =
        !normalizedQuery ||
        [permission.name, permission.description, permission.key, permission.category]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
      if (!matchesSearch) return false;

      if (sourceFilter === "direct_role") {
        return permission.sources.some((source) => source.type === "direct_role");
      }
      if (sourceFilter === "group_role") {
        return permission.sources.some((source) => source.type === "group_role");
      }
      if (sourceFilter === "privileged") {
        return permission.sources.some(
          (source) => source.type === "workspace_owner" || source.type === "instance_admin"
        );
      }
      if (sourceFilter === "not_granted") return !permission.is_granted;
      return true;
    });
  }, [permissions, searchQuery, sourceFilter]);

  const permissionGroups = useMemo(() => {
    const uncategorized = t("workspace_settings.settings.my_access.permissions.uncategorized");
    const groups = new Map<string, IWorkspaceMyAccessPermission[]>();
    for (const permission of filteredPermissions) {
      const category = permission.category || uncategorized;
      groups.set(category, [...(groups.get(category) ?? []), permission]);
    }
    return Array.from(groups.entries())
      .map(([category, categoryPermissions]) => ({
        category,
        permissions: categoryPermissions.toSorted(comparePermissions),
        grantedCount: categoryPermissions.filter((permission) => permission.is_granted).length,
      }))
      .toSorted((a, b) => comparePermissionCategories("workspace", a.category, b.category));
  }, [filteredPermissions, t]);

  const totalGranted = permissions.filter((permission) => permission.is_granted).length;
  const firstGrantedCategory =
    permissionGroups.find((group) => group.grantedCount > 0)?.category ?? permissionGroups[0]?.category;

  const clearFilters = () => {
    setSearchQuery("");
    setSourceFilter("all");
  };

  const sourceLabel = (source: IWorkspaceMyAccessPermissionSource) => {
    if (source.type === "direct_role") {
      return t("workspace_settings.settings.my_access.permissions.sources.direct_role", {
        role: source.role?.name ?? "—",
      });
    }
    if (source.type === "group_role") {
      return t("workspace_settings.settings.my_access.permissions.sources.group_role", {
        group: source.group?.name ?? "—",
        role: source.role?.name ?? "—",
      });
    }
    return t(`workspace_settings.settings.my_access.permissions.sources.${source.type}`);
  };

  const handleCopyPermissionKey = async (permissionKey: string) => {
    try {
      await copyTextToClipboard(permissionKey);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("workspace_settings.settings.my_access.permissions.copied"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("workspace_settings.settings.my_access.permissions.copy_failed"),
      });
    }
  };

  return (
    <section className="mt-10" aria-labelledby="my-access-permissions-heading">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <h2 id="my-access-permissions-heading" className="text-16 font-semibold text-primary">
          {t("workspace_settings.settings.my_access.permissions.title")}
        </h2>
        {permissions.length > 0 && (
          <p className="shrink-0 text-caption-md-medium text-tertiary tabular-nums">
            {t("workspace_settings.settings.my_access.permissions.summary", {
              granted: totalGranted,
              total: permissions.length,
            })}
          </p>
        )}
      </div>

      {permissions.length === 0 ? (
        <div className="mt-4 flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-subtle px-6 text-center">
          <div className="grid size-10 place-items-center rounded-lg bg-layer-1">
            <ShieldCheck className="size-4 text-tertiary" />
          </div>
          <p className="mt-3 text-body-sm-medium text-secondary">
            {t("workspace_settings.settings.my_access.permissions.no_permissions")}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-placeholder" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("workspace_settings.settings.my_access.permissions.search_placeholder")}
                aria-label={t("workspace_settings.settings.my_access.permissions.search_placeholder")}
                className="h-11 w-full pr-3 pl-9 text-body-sm-regular placeholder:text-secondary"
              />
            </div>
            <CustomSelect
              value={sourceFilter}
              onChange={(value: string | number) => setSourceFilter(String(value) as TPermissionSourceFilter)}
              label={t(FILTER_I18N_KEYS[sourceFilter])}
              buttonClassName="h-11 min-w-48 border border-subtle bg-layer-2 !rounded-md !shadow-none"
              placement="bottom-end"
              maxHeight="lg"
            >
              {availableFilters.map((filter) => (
                <CustomSelect.Option key={filter} value={filter}>
                  {t(FILTER_I18N_KEYS[filter])}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>

          {permissionGroups.length === 0 ? (
            <div className="mt-4 flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-subtle px-6 text-center">
              <Search className="size-5 text-placeholder" />
              <p className="mt-3 text-body-sm-medium text-secondary">
                {t("workspace_settings.settings.my_access.permissions.no_results")}
              </p>
              <Button variant="link-primary" size="sm" className="mt-2" onClick={clearFilters}>
                {t("workspace_settings.settings.my_access.permissions.clear_filters")}
              </Button>
            </div>
          ) : (
            <Accordion.Root
              allowMultiple
              defaultValue={firstGrantedCategory ? [firstGrantedCategory] : []}
              className="mt-4 overflow-hidden rounded-xl border border-subtle bg-surface-1"
            >
              {permissionGroups.map((group) => (
                <Accordion.Item
                  key={group.category}
                  value={group.category}
                  className="border-b border-subtle last:border-b-0"
                >
                  <Accordion.Trigger
                    className="group min-h-15 px-4 text-left transition-colors duration-150 hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none sm:px-5"
                    icon={
                      <ChevronDown className="size-4 text-tertiary transition-transform duration-200 ease-out group-data-[panel-open]:rotate-180 motion-reduce:transition-none" />
                    }
                  >
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-4">
                      <span className="min-w-0 truncate text-body-sm-medium text-primary">{group.category}</span>
                      <span className="shrink-0 text-caption-sm-medium text-tertiary tabular-nums">
                        {t("workspace_settings.settings.my_access.permissions.summary", {
                          granted: group.grantedCount,
                          total: group.permissions.length,
                        })}
                      </span>
                    </span>
                  </Accordion.Trigger>
                  <Accordion.Content
                    className="motion-reduce:transition-none"
                    contentWrapperClassName="border-t border-subtle py-0"
                  >
                    <div className="divide-y divide-subtle">
                      {group.permissions.map((permission) => (
                        <details key={permission.key} className="group/permission bg-surface-1 open:bg-layer-2">
                          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none sm:px-5 [&::-webkit-details-marker]:hidden">
                            {permission.is_granted ? (
                              <CheckCircle2 className="size-4 shrink-0 text-success-primary" aria-hidden="true" />
                            ) : (
                              <CircleMinus className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                            )}
                            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-body-sm-medium text-primary">{permission.name}</span>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-caption-sm-medium",
                                  permission.is_granted
                                    ? "bg-success-subtle text-success-primary"
                                    : "bg-layer-1 text-secondary"
                                )}
                              >
                                {t(
                                  permission.is_granted
                                    ? "workspace_settings.settings.my_access.permissions.granted"
                                    : "workspace_settings.settings.my_access.permissions.not_granted"
                                )}
                              </span>
                            </span>
                            <ChevronDown className="size-4 shrink-0 text-placeholder transition-transform duration-200 group-open/permission:rotate-180 motion-reduce:transition-none" />
                          </summary>
                          <div className="border-t border-subtle px-4 py-4 sm:px-12">
                            {permission.description && (
                              <p className="max-w-3xl text-body-sm-regular text-secondary">
                                {permission.description}
                              </p>
                            )}
                            <div className={cn("grid gap-4", permission.description && "mt-4")}>
                              <div>
                                <p className="text-caption-sm-medium text-tertiary">
                                  {t("workspace_settings.settings.my_access.permissions.permission_key")}
                                </p>
                                <div className="mt-1.5 flex min-w-0 items-center gap-2">
                                  <code className="min-w-0 flex-1 rounded-md bg-layer-1 px-2.5 py-2 text-caption-md-regular break-all text-secondary">
                                    {permission.key}
                                  </code>
                                  <button
                                    type="button"
                                    onClick={() => void handleCopyPermissionKey(permission.key)}
                                    className="grid size-11 shrink-0 place-items-center rounded-md border border-subtle text-tertiary transition-colors hover:bg-layer-1-hover hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none"
                                    aria-label={t("workspace_settings.settings.my_access.permissions.copy_key")}
                                    title={t("workspace_settings.settings.my_access.permissions.copy_key")}
                                  >
                                    <Copy className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div>
                                <p className="text-caption-sm-medium text-tertiary">
                                  {t("workspace_settings.settings.my_access.permissions.source")}
                                </p>
                                {permission.sources.length > 0 ? (
                                  <ul className="mt-1.5 space-y-1.5">
                                    {permission.sources.map((source) => (
                                      <li
                                        key={`${source.type}-${source.role?.id ?? "none"}-${source.group?.id ?? "none"}`}
                                        className="flex items-start gap-2 text-body-sm-regular text-secondary"
                                      >
                                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-primary" />
                                        <span>{sourceLabel(source)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-1.5 text-body-sm-regular text-secondary">
                                    {t("workspace_settings.settings.my_access.permissions.no_source")}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  </Accordion.Content>
                </Accordion.Item>
              ))}
            </Accordion.Root>
          )}
        </>
      )}
    </section>
  );
}
