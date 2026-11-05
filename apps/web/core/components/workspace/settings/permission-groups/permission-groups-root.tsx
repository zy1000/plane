/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useSearchParams } from "react-router";
import useSWR from "swr";
import { PERMISSION_KEYS } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPermissionGroup, TPermissionGroupKind } from "@plane/types";
import { Breadcrumbs } from "@plane/ui";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspaceRoles } from "@/hooks/store/use-workspace-roles";
import { useUserPermissions } from "@/hooks/store/user";
import { DeletePermissionGroupModal } from "./delete-group-modal";
import { PermissionGroupFormModal } from "./group-form-modal";
import { PermissionGroupsList } from "./groups-list";
import {
  PERMISSION_GROUP_KIND_LABELS,
  getPermissionGroupDefaultTab,
  getPermissionGroupDetailPath,
  isPermissionGroupKind,
} from "./helpers";

const READ_KEYS = [
  PERMISSION_KEYS.WORKSPACE_PERMISSION_GROUP_VIEW,
  PERMISSION_KEYS.WORKSPACE_PERMISSION_GROUP_MANAGE,
  PERMISSION_KEYS.WORKSPACE_MEMBER_MANAGE,
];

const CREATED_NEXT_STEP: Record<TPermissionGroupKind, string> = {
  workspace: "接着勾选它的权限",
  project_template: "接着勾选它的项目权限",
  data: "接着设置它的可见范围",
};

/** 工作区设置 › 权限组（列表页）：三段「工作区权限组 / 项目权限模板 / 数据权限」，当前段存 URL ?kind= */
export const PermissionGroupsRoot = observer(function PermissionGroupsRoot(props: { workspaceSlug: string }) {
  const { workspaceSlug } = props;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { workspaceUserInfo, allowWorkspacePermissionKeys } = useUserPermissions();
  const { totalProjectIds } = useProject();
  const canView = allowWorkspacePermissionKeys(READ_KEYS, workspaceSlug);
  const canManage = allowWorkspacePermissionKeys([PERMISSION_KEYS.WORKSPACE_PERMISSION_GROUP_MANAGE], workspaceSlug);

  const { roles, groupsByKind, isLoading, error, fetchRoles, createRole, deleteRole } =
    useWorkspaceRoles(workspaceSlug);
  useSWR(canView ? `WORKSPACE_PERMISSION_GROUPS_${workspaceSlug}` : null, canView ? fetchRoles : null);

  const kindParam = searchParams.get("kind");
  const kind: TPermissionGroupKind = isPermissionGroupKind(kindParam) ? kindParam : "workspace";
  const setKind = (next: TPermissionGroupKind) => setSearchParams({ kind: next }, { replace: true });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IPermissionGroup | null>(null);

  if (workspaceUserInfo && !canView) return <NotAuthorizedView section="settings" className="h-auto" />;

  const Icon = WORKSPACE_SETTINGS_ICONS.roles;
  const header = (
    <SettingsPageHeader
      leftItem={
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={<BreadcrumbLink label="权限组" icon={<Icon className="size-4 text-tertiary" />} />}
          />
        </Breadcrumbs>
      }
      rightItem={
        canManage ? (
          <Button variant="primary" size="lg" onClick={() => setIsCreateOpen(true)}>
            新建{PERMISSION_GROUP_KIND_LABELS[kind]}
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <SettingsContentWrapper header={header} hugging>
      <PageHead title="权限组" />
      {error && roles.length === 0 ? (
        <div className="rounded-lg border border-subtle py-12 text-center">
          <p className="text-13 text-secondary">{error}</p>
          <Button className="mt-3" variant="secondary" size="lg" onClick={() => void fetchRoles()}>
            重试
          </Button>
        </div>
      ) : (
        <PermissionGroupsList
          workspaceSlug={workspaceSlug}
          kind={kind}
          onKindChange={setKind}
          groupsByKind={groupsByKind}
          totalProjectCount={totalProjectIds?.length}
          isLoading={isLoading}
          canManage={canManage}
          onDelete={setPendingDelete}
        />
      )}

      <PermissionGroupFormModal
        isOpen={isCreateOpen}
        group={null}
        defaultKind={kind}
        copyCandidates={roles}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={async (value) => {
          const created = await createRole({
            name: value.name,
            description: value.description,
            kind: value.kind,
            copy_from: value.copy_from,
          });
          setIsCreateOpen(false);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: `已创建「${created.name}」`,
            message: CREATED_NEXT_STEP[created.kind],
          });
          navigate(getPermissionGroupDetailPath(workspaceSlug, created.id, getPermissionGroupDefaultTab(created.kind)));
        }}
      />
      <DeletePermissionGroupModal
        group={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={async (target) => {
          await deleteRole(target.id);
        }}
      />
    </SettingsContentWrapper>
  );
});
