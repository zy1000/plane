/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useSearchParams } from "react-router";
import useSWR from "swr";
import { PERMISSION_KEYS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPermissionGroup } from "@plane/types";
import { Breadcrumbs, Header, Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";
import { useMember } from "@/hooks/store/use-member";
import {
  fetchPermissionGroupContent,
  usePermissionGroupDataScope,
  usePermissionGroupDetail,
  usePermissionGroupTemplateProjects,
} from "@/hooks/store/use-permission-group-detail";
import { useWorkspaceRoles } from "@/hooks/store/use-workspace-roles";
import { useUserPermissions } from "@/hooks/store/user";
import { DataScopeTab } from "./data-scope";
import { DeletePermissionGroupModal } from "./delete-group-modal";
import { PermissionGroupEditor } from "./editor";
import type { TCopySource } from "./editor";
import { PermissionGroupFormModal } from "./group-form-modal";
import { PermissionGroupMembersPanel } from "./group-members-panel";
import { formatScopeSummary, getPermissionGroupErrorMessage, getPermissionGroupsPath } from "./helpers";
import { PermissionGroupSaveBar } from "./save-bar";
import { TemplateProjectsPanel } from "./template-projects-panel";

type TDetailTab = "members" | "permissions" | "data-scope" | "referenced";

const I18N = "workspace_settings.settings.roles";

const READ_KEYS = [
  PERMISSION_KEYS.WORKSPACE_PERMISSION_GROUP_VIEW,
  PERMISSION_KEYS.WORKSPACE_PERMISSION_GROUP_MANAGE,
  PERMISSION_KEYS.WORKSPACE_MEMBER_MANAGE,
];

/**
 * 权限组详情：成员 / 权限 / 数据权限 / 引用项目（最后一个只有模板组有）。
 * 权限与数据权限各自是草稿 + 底部保存条，整份提交。
 */
export const PermissionGroupDetail = observer(function PermissionGroupDetail(props: {
  workspaceSlug: string;
  roleId: string;
}) {
  const { workspaceSlug, roleId } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { workspaceUserInfo, allowWorkspacePermissionKeys, fetchWorkspacePermissionKeys } = useUserPermissions();
  const { getUserDetails } = useMember();
  const canView = allowWorkspacePermissionKeys(READ_KEYS, workspaceSlug);
  const canManage = allowWorkspacePermissionKeys([PERMISSION_KEYS.WORKSPACE_PERMISSION_GROUP_MANAGE], workspaceSlug);

  const { roles, fetchRoles, updateRole, deleteRole, refreshRole } = useWorkspaceRoles(workspaceSlug);
  useSWR(canView ? `WORKSPACE_PERMISSION_GROUPS_${workspaceSlug}` : null, canView ? fetchRoles : null, {
    revalidateOnFocus: false,
  });
  const group: IPermissionGroup | undefined = roles.find((role) => role.id === roleId);
  const isTemplate = Boolean(group?.is_template);

  const editor = usePermissionGroupDetail(canView ? workspaceSlug : undefined, roleId);
  const dataScope = usePermissionGroupDataScope(canView ? workspaceSlug : undefined, roleId);
  const templateProjects = usePermissionGroupTemplateProjects(workspaceSlug, roleId, canView && isTemplate);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IPermissionGroup | null>(null);

  const referencingCount = useMemo(
    () => templateProjects.projects.filter((project) => !project.excluded).length,
    [templateProjects.projects]
  );
  const tabs = useMemo<{ key: TDetailTab; label: string; count?: number }[]>(() => {
    if (!group) return [];
    const list: { key: TDetailTab; label: string; count?: number }[] = [
      { key: "members", label: "成员", count: group.member_count },
      { key: "permissions", label: "权限" },
      { key: "data-scope", label: t(`${I18N}.data_scope.title`) },
    ];
    if (isTemplate) list.push({ key: "referenced", label: t(`${I18N}.referenced_projects`), count: referencingCount });
    return list;
  }, [group, isTemplate, referencingCount, t]);

  const requestedTab = searchParams.get("tab") as TDetailTab | null;
  const activeTab: TDetailTab = tabs.some((tab) => tab.key === requestedTab) ? requestedTab! : "permissions";
  const setTab = (tab: TDetailTab) => setSearchParams({ tab }, { replace: true });

  // 组被删了 / id 不对：列表拉回来后还找不到就回列表
  useEffect(() => {
    if (roles.length > 0 && !group && editor.error) navigate(getPermissionGroupsPath(workspaceSlug));
  }, [roles.length, group, editor.error, navigate, workspaceSlug]);

  const copySources = useMemo<TCopySource[]>(
    () => roles.filter((role) => role.id !== roleId).map((role) => ({ id: role.id, name: role.name })),
    [roles, roleId]
  );
  const loadCopySource = useCallback(
    (sourceId: string) => fetchPermissionGroupContent(workspaceSlug, sourceId),
    [workspaceSlug]
  );

  const refreshAfterChange = () => {
    void refreshRole(roleId).catch(() => undefined);
    // 自己可能就在这个组里：刷新自己的 key，侧栏 / 按钮立刻反映
    void fetchWorkspacePermissionKeys(workspaceSlug).catch(() => undefined);
  };

  const handleSave = async () => {
    try {
      await editor.save();
      refreshAfterChange();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "权限已保存" });
    } catch (saveError) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "保存失败",
        message: getPermissionGroupErrorMessage(saveError, "请稍后重试"),
      });
    }
  };

  const handleSaveDataScope = async () => {
    try {
      await dataScope.save();
      refreshAfterChange();
      if (isTemplate) void templateProjects.reload();
      setToast({ type: TOAST_TYPE.SUCCESS, title: `${t(`${I18N}.data_scope.title`)}已保存` });
    } catch (saveError) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "保存失败",
        message: getPermissionGroupErrorMessage(saveError, "请稍后重试"),
      });
    }
  };

  if (workspaceUserInfo && !canView) return <NotAuthorizedView section="settings" className="h-auto" />;

  const RolesIcon = WORKSPACE_SETTINGS_ICONS.roles;
  const listPath = getPermissionGroupsPath(workspaceSlug);
  const updater = group?.updated_by ? getUserDetails(group.updated_by) : undefined;
  const subtitle = group
    ? [
        isTemplate ? "模板" : null,
        `${group.member_count} 人`,
        isTemplate ? `${group.referenced_project_count ?? 0} 个项目引用` : null,
        `项目白名单：${formatScopeSummary(group.data_scope_summary?.projects)}`,
        group.updated_at
          ? `${updater?.display_name ? `${updater.display_name} ` : ""}更新于 ${renderFormattedDate(group.updated_at)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const readOnly = !canManage || !editor.detail?.is_editable;
  const projectPermissionCount = editor.draft?.permission_keys.filter((key) => key.startsWith("project.")).length ?? 0;

  const header = (
    <Header>
      <Header.LeftItem className="min-w-0">
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink label="权限组" href={listPath} icon={<RolesIcon className="size-4 text-tertiary" />} />
            }
          />
          <Breadcrumbs.Item component={<BreadcrumbLink label={group?.name ?? "…"} isLast />} />
        </Breadcrumbs>
      </Header.LeftItem>
      {canManage && group && (
        <Header.RightItem>
          <Button variant="secondary" size="lg" onClick={() => setIsEditOpen(true)}>
            编辑
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="text-danger-primary"
            onClick={() => setPendingDelete(group)}
          >
            删除
          </Button>
        </Header.RightItem>
      )}
    </Header>
  );

  return (
    <SettingsContentWrapper header={header} hugging>
      <PageHead title={group ? `权限组 - ${group.name}` : "权限组"} />
      {!group ? (
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="36px" width="240px" />
          <Loader.Item height="20px" width="360px" />
          <Loader.Item height="480px" />
        </Loader>
      ) : (
        <div className="flex flex-col">
          <h1 className="text-20 font-semibold text-primary">{group.name}</h1>
          <p className="mt-1 text-13 text-tertiary">{subtitle}</p>
          {group.description && <p className="mt-1 max-w-3xl text-13 text-secondary">{group.description}</p>}

          <div className="mt-5 flex items-end gap-6 border-b border-subtle">
            {tabs.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={cn(
                    "-mb-px flex h-10 items-center gap-2 border-b-2 px-1 text-14 font-medium transition-colors",
                    isActive
                      ? "border-accent-strong text-accent-primary"
                      : "border-transparent text-secondary hover:text-primary"
                  )}
                  onClick={() => setTab(tab.key)}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className="rounded-full bg-layer-1 px-1.5 text-11 leading-5 text-tertiary tabular-nums">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            {activeTab === "members" && (
              <PermissionGroupMembersPanel
                workspaceSlug={workspaceSlug}
                group={group}
                canManage={canManage}
                onChanged={() => void refreshRole(roleId).catch(() => undefined)}
              />
            )}
            {activeTab === "permissions" &&
              (editor.isLoading && !editor.draft ? (
                <Loader className="flex flex-col gap-3">
                  <Loader.Item height="36px" />
                  <Loader.Item height="480px" />
                </Loader>
              ) : editor.error || !editor.draft || !editor.detail ? (
                <div className="rounded-lg border border-subtle py-12 text-center">
                  <p className="text-13 text-secondary">{editor.error ?? "读取权限失败"}</p>
                  <Button className="mt-3" variant="secondary" size="lg" onClick={() => void editor.reload()}>
                    重试
                  </Button>
                </div>
              ) : (
                <>
                  <PermissionGroupEditor
                    scopes={["workspace", "project"]}
                    defaultScope="project"
                    value={editor.draft}
                    onChange={editor.setDraft}
                    typeOptions={editor.detail.type_options}
                    typeSourceLabel="类型库"
                    readOnly={readOnly}
                    notice={
                      <div className="flex flex-col gap-2">
                        {!canManage && (
                          <div className="rounded-lg border border-subtle bg-layer-1 px-4 py-2.5 text-13 text-secondary">
                            你没有管理权限组的权限，只能查看。
                          </div>
                        )}
                        {projectPermissionCount === 0 && (
                          <div className="rounded-lg border border-subtle bg-warning-subtle px-4 py-2.5 text-13 text-warning-primary">
                            {t(`${I18N}.data_scope.empty_project_permissions`)}
                          </div>
                        )}
                        {isTemplate && (
                          <p className="text-13 text-tertiary">
                            改动保存后，引用这个模板的 {group.referenced_project_count ?? 0} 个项目立即生效。
                          </p>
                        )}
                      </div>
                    }
                    copySources={copySources}
                    loadCopySource={readOnly ? undefined : loadCopySource}
                  />
                  {editor.isDirty && !readOnly && (
                    <PermissionGroupSaveBar
                      count={editor.changedCount}
                      isSaving={editor.isSaving}
                      onDiscard={editor.discard}
                      onSave={() => void handleSave()}
                    />
                  )}
                </>
              ))}
            {activeTab === "data-scope" &&
              (dataScope.isLoading && !dataScope.draft ? (
                <Loader className="flex flex-col gap-3">
                  <Loader.Item height="160px" />
                  <Loader.Item height="160px" />
                </Loader>
              ) : dataScope.error || !dataScope.draft ? (
                <div className="rounded-lg border border-subtle py-12 text-center">
                  <p className="text-13 text-secondary">{dataScope.error ?? "读取数据权限失败"}</p>
                  <Button className="mt-3" variant="secondary" size="lg" onClick={() => void dataScope.reload()}>
                    重试
                  </Button>
                </div>
              ) : (
                <>
                  <DataScopeTab
                    workspaceSlug={workspaceSlug}
                    value={dataScope.draft}
                    onChange={dataScope.setDraft}
                    readOnly={!canManage}
                  />
                  {dataScope.isDirty && canManage && (
                    <PermissionGroupSaveBar
                      count={dataScope.changedCount}
                      isSaving={dataScope.isSaving}
                      onDiscard={dataScope.discard}
                      onSave={() => void handleSaveDataScope()}
                    />
                  )}
                </>
              ))}
            {activeTab === "referenced" && (
              <TemplateProjectsPanel
                workspaceSlug={workspaceSlug}
                projects={templateProjects.projects}
                isLoading={templateProjects.isLoading}
                canManage={canManage}
                onExclude={async (projectId) => {
                  await templateProjects.exclude(projectId);
                  void refreshRole(roleId).catch(() => undefined);
                }}
                onRestore={async (projectId) => {
                  await templateProjects.restore(projectId);
                  void refreshRole(roleId).catch(() => undefined);
                }}
              />
            )}
          </div>
        </div>
      )}

      {group && (
        <PermissionGroupFormModal
          isOpen={isEditOpen}
          group={group}
          copyCandidates={[]}
          onClose={() => setIsEditOpen(false)}
          onSubmit={async (value) => {
            await updateRole(group.id, {
              name: value.name,
              description: value.description,
              is_template: value.is_template,
            });
            setIsEditOpen(false);
            setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存" });
          }}
        />
      )}
      <DeletePermissionGroupModal
        group={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={async (target) => {
          await deleteRole(target.id);
          navigate(getPermissionGroupsPath(workspaceSlug));
        }}
      />
    </SettingsContentWrapper>
  );
});
