/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertCircle, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { IWorkspaceMyAccess } from "@plane/types";
import { Avatar, Button } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { useUser } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { MyAccessPermissionsList } from "./permissions-list";

type Props = {
  data: IWorkspaceMyAccess | undefined;
  error: unknown;
  isLoading: boolean;
  onRetry: () => void;
};

function MyAccessSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div className="animate-pulse" role="status">
      <div className="h-5 w-72 rounded bg-layer-1" />
      <div className="mt-2 h-3 w-full max-w-xl rounded bg-layer-1" />
      <div className="mt-7 overflow-hidden rounded-xl border border-subtle">
        <div className="flex items-center gap-3 p-5">
          <div className="size-11 rounded-full bg-layer-1" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-40 rounded bg-layer-1" />
            <div className="mt-2 h-3 w-56 rounded bg-layer-1" />
          </div>
        </div>
        <div className="grid border-t border-subtle md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="border-b border-subtle p-4 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0"
            >
              <div className="h-3 w-20 rounded bg-layer-1" />
              <div className="mt-2 h-4 w-32 rounded bg-layer-1" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-10 h-4 w-28 rounded bg-layer-1" />
      <div className="mt-4 space-y-px overflow-hidden rounded-xl border border-subtle bg-layer-1">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-14 bg-surface-1" />
        ))}
      </div>
      <div className="mt-10 h-4 w-32 rounded bg-layer-1" />
      <div className="mt-4 space-y-px overflow-hidden rounded-xl border border-subtle bg-layer-1">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-16 bg-surface-1" />
        ))}
      </div>
      <span className="sr-only">{loadingLabel}</span>
    </div>
  );
}

export const MyAccessRoot = observer(function MyAccessRoot({ data, error, isLoading, onRetry }: Props) {
  const { t, currentLocale } = useTranslation();
  const { data: currentUser } = useUser();
  const { currentWorkspace } = useWorkspace();

  if (isLoading) return <MyAccessSkeleton loadingLabel={t("workspace_settings.settings.my_access.loading")} />;

  if (error || !data) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-subtle px-6 text-center">
        <div className="grid size-11 place-items-center rounded-lg bg-danger-subtle">
          <AlertCircle className="size-5 text-danger-primary" />
        </div>
        <h2 className="mt-4 text-body-md-medium text-primary">
          {t("workspace_settings.settings.my_access.error.title")}
        </h2>
        <p className="mt-1 max-w-md text-body-sm-regular text-secondary">
          {t("workspace_settings.settings.my_access.error.description")}
        </p>
        <Button variant="neutral-primary" size="md" className="mt-4" prependIcon={<RefreshCw />} onClick={onRetry}>
          {t("workspace_settings.settings.my_access.error.retry")}
        </Button>
      </div>
    );
  }

  const membership = data.membership;

  const joinedAt = (() => {
    if (!membership.joined_at) return t("workspace_settings.settings.my_access.identity.unavailable");
    const date = new Date(membership.joined_at);
    if (Number.isNaN(date.getTime())) return t("workspace_settings.settings.my_access.identity.unavailable");
    return new Intl.DateTimeFormat(currentLocale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  })();

  const displayName = currentUser?.display_name || currentUser?.email || "—";
  const totalPermissions = data.permissions.length;
  const grantedPermissions = data.permissions.filter((permission) => permission.is_granted).length;

  return (
    <>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-18 font-semibold text-primary">{t("workspace_settings.settings.my_access.title")}</h1>
          <span className="rounded-full border border-subtle bg-layer-1 px-2 py-0.5 text-caption-sm-medium text-tertiary">
            {t("workspace_settings.settings.my_access.read_only")}
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-body-sm-regular text-secondary">
          {t("workspace_settings.settings.my_access.description")}
        </p>
      </div>

      <section
        className="mt-7 overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-raised-100"
        aria-labelledby="workspace-identity-heading"
      >
        <div className="flex items-center gap-3.5 p-5">
          <Avatar
            name={displayName}
            src={getFileURL(currentUser?.avatar_url ?? "")}
            size={44}
            shape="circle"
            className="shrink-0 text-16 font-medium"
          />
          <div className="min-w-0">
            <h2 id="workspace-identity-heading" className="truncate text-body-md-medium text-primary">
              {displayName}
            </h2>
            <p className="mt-0.5 truncate text-caption-md-regular text-secondary">{currentUser?.email}</p>
          </div>
        </div>
        <dl className="grid border-t border-subtle md:grid-cols-3 md:divide-x md:divide-subtle">
          <div className="border-b border-subtle px-5 py-4 md:border-b-0">
            <dt className="text-caption-sm-medium text-tertiary">
              {t("workspace_settings.settings.my_access.identity.workspace")}
            </dt>
            <dd className="mt-1 truncate text-body-sm-medium text-primary">{currentWorkspace?.name ?? "—"}</dd>
          </div>
          <div className="border-b border-subtle px-5 py-4 md:border-b-0">
            <dt className="text-caption-sm-medium text-tertiary">
              {t("workspace_settings.settings.my_access.identity.granted_permissions")}
            </dt>
            <dd className="mt-1 text-body-sm-medium text-primary tabular-nums">
              {t("workspace_settings.settings.my_access.permissions.summary", {
                granted: grantedPermissions,
                total: totalPermissions,
              })}
            </dd>
          </div>
          <div className="px-5 py-4">
            <dt className="text-caption-sm-medium text-tertiary">
              {t("workspace_settings.settings.my_access.identity.joined")}
            </dt>
            <dd className="mt-1 text-body-sm-medium text-primary tabular-nums">{joinedAt}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="access-sources-heading">
        <h2 id="access-sources-heading" className="text-16 font-semibold text-primary">
          {t("workspace_settings.settings.my_access.sources.title")}
        </h2>

        <div className="mt-5 overflow-hidden rounded-xl border border-subtle bg-surface-1">
          <div className="px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-primary/10">
                <ShieldCheck className="size-4 text-accent-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm-medium text-primary">
                  {t("workspace_settings.settings.my_access.sources.direct_roles")}
                </p>
                {data.direct_roles.length > 0 ? (
                  <ul className="mt-3 divide-y divide-subtle border-t border-subtle">
                    {data.direct_roles.map((role) => (
                      <li key={role.id} className="flex items-start gap-3 py-3 last:pb-0">
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent-primary" />
                        <div className="min-w-0">
                          <p className="text-body-sm-medium text-primary">{role.name}</p>
                          {role.description && (
                            <p className="mt-0.5 text-caption-md-regular text-secondary">{role.description}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 rounded-lg bg-layer-1 px-3 py-2.5 text-caption-md-regular text-secondary">
                    {t("workspace_settings.settings.my_access.sources.no_direct_roles")}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-subtle px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-layer-1">
                <UsersRound className="size-4 text-tertiary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm-medium text-primary">
                  {t("workspace_settings.settings.my_access.sources.teams")}
                </p>
                {data.groups.length > 0 ? (
                  <ul className="mt-3 divide-y divide-subtle border-t border-subtle">
                    {data.groups.map((group) => (
                      <li
                        key={group.id}
                        className="flex flex-col gap-2.5 py-3 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-body-sm-medium text-primary">{group.name}</p>
                          {group.description && (
                            <p className="mt-0.5 text-caption-md-regular text-secondary">{group.description}</p>
                          )}
                        </div>
                        <div className="flex max-w-full flex-wrap gap-1.5 sm:max-w-[55%] sm:justify-end">
                          {group.roles.length > 0 ? (
                            group.roles.map((role) => (
                              <span
                                key={role.id}
                                className="max-w-full truncate rounded-md bg-layer-1 px-2 py-1 text-caption-sm-medium text-secondary"
                                title={role.name}
                              >
                                {role.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-caption-sm-regular text-tertiary">
                              {t("workspace_settings.settings.my_access.sources.no_team_roles")}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 rounded-lg bg-layer-1 px-3 py-2.5 text-caption-md-regular text-secondary">
                    {t("workspace_settings.settings.my_access.sources.no_teams")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <MyAccessPermissionsList permissions={data.permissions} />
    </>
  );
});
