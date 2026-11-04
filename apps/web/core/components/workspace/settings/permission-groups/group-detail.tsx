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
import { renderFormattedPayloadDate } from "@plane/utils";
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
  usePermissionGroupMembers,
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
import { TemplateTag } from "./groups-list";
import { DATA_SCOPE_MODE_LABELS, getPermissionGroupErrorMessage, getPermissionGroupsPath } from "./helpers";
import { PermissionGroupSaveBar } from "./save-bar";
import { TemplateProjectsPanel } from "./template-projects-panel";
import { PermissionGroupIdentity, PermissionGroupTiles, countDepartments } from "./ui";
import type { TDetailTile } from "./ui";

type TDetailTab = "permissions" | "data-scope" | "members" | "referenced";

const I18N = "workspace_settings.settings.roles";

const READ_KEYS = [
  PERMISSION_KEYS.WORKSPACE_PERMISSION_GROUP_VIEW,
  PERMISSION_KEYS.WORKSPACE_PERMISSION_GROUP_MANAGE,
  PERMISSION_KEYS.WORKSPACE_MEMBER_MANAGE,
];

/**
 * 权限组详情：头部 + 数字卡片（兼做页签）：权限 / 数据权限 / 成员 / 引用项目（最后一个只有模板组有）。
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
  const members = usePermissionGroupMembers(workspaceSlug, roleId, canView);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IPermissionGroup | null>(null);

  const referencingCount = useMemo(
    () => templateProjects.projects.filter((project) => !project.excluded).length,
    [templateProjects.projects]
  );
  const excludedCount = templateProjects.projects.length - referencingCount;
  // 不用 useMemo：成员详情晚于成员 id 到达时要跟着重算（observer 会重渲）
  const departmentCount = countDepartments(members.memberIds, getUserDetails);

  // 权限卡片跟草稿走：勾了还没保存也能看到数字在变
  const draftKeys = editor.draft?.permission_keys;
  const projectPermissionCount = draftKeys
    ? draftKeys.filter((key) => key.startsWith("project.")).length
    : (group?.project_permission_count ?? 0);
  const workspacePermissionCount = draftKeys
    ? draftKeys.filter((key) => key.startsWith("workspace.")).length
    : (group?.workspace_permission_count ?? 0);

  const tiles = useMemo<TDetailTile<TDetailTab>[]>(() => {
    if (!group) return [];
    const projectsScope = group.data_scope_summary?.projects;
    const productsScope = group.data_scope_summary?.products;
    const productText =
      !productsScope || productsScope.mode === "all" ? "产品全部" : `产品 ${productsScope.count ?? 0} 个`;
    const list: TDetailTile<TDetailTab>[] = [
      {
        key: "permissions",
        label: "权限",
        value: projectPermissionCount + workspacePermissionCount,
        unit: "项",
        sub: `项目 ${projectPermissionCount} · 工作区 ${workspacePermissionCount}`,
      },
      {
        key: "data-scope",
        label: t(`${I18N}.data_scope.title`),
        value: projectsScope?.count ?? "—",
        unit: "个项目",
        sub: `${DATA_SCOPE_MODE_LABELS[projectsScope?.mode ?? "all"]} · ${productText}`,
      },
      {
        key: "members",
        label: "成员",
        value: members.isLoading && members.memberIds.length === 0 ? group.member_count : members.memberIds.length,
        unit: "人",
        sub: departmentCount > 0 ? `来自 ${departmentCount} 个部门` : undefined,
      },
    ];
    if (isTemplate)
      list.push({
        key: "referenced",
        label: t(`${I18N}.referenced_projects`),
        value: templateProjects.isLoading && templateProjects.projects.length === 0
          ? (group.referenced_project_count ?? 0)
          : referencingCount,
        unit: "个",
        sub: excludedCount > 0 ? `已移除 ${excludedCount} 个` : undefined,
      });
    return list;
  }, [
    group,
    isTemplate,
    projectPermissionCount,
    workspacePermissionCount,
    members.isLoading,
    members.memberIds.length,
    departmentCount,
    templateProjects.isLoading,
    templateProjects.projects.length,
    referencingCount,
    excludedCount,
    t,
  ]);

  const requestedTab = searchParams.get("tab") as TDetailTab | null;
  const activeTab: TDetailTab = tiles.some((tile) => tile.key === requestedTab) ? requestedTab! : "permissions";
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
  const meta = group?.updated_at
    ? `${updater?.display_name ? `${updater.display_name} ` : ""}更新于 ${renderFormattedPayloadDate(group.updated_at)}`
    : null;
  const readOnly = !canManage || !editor.detail?.is_editable;
  const saveHint = isTemplate && referencingCount > 0 ? `保存后 ${referencingCount} 个引用项目同步生效` : undefined;

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
    </Header>
  );

  return (
    <SettingsContentWrapper header={header} hugging>
      <PageHead title={group ? `权限组 - ${group.name}` : "权限组"} />
      {!group ? (
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="36px" width="240px" />
          <Loader.Item height="96px" />
          <Loader.Item height="480px" />
        </Loader>
      ) : (
        <div className="flex flex-col gap-5">
          <PermissionGroupIdentity
            name={group.name}
            badge={isTemplate ? <TemplateTag /> : undefined}
            description={group.description}
            meta={meta}
            actions={
              canManage ? (
                <>
                  <Button variant="secondary" size="xl" className="h-9 px-4" onClick={() => setIsEditOpen(true)}>
                    编辑
                  </Button>
                  <Button
                    variant="secondary"
                    size="xl"
                    className="h-9 px-4 text-danger-primary"
                    onClick={() => setPendingDelete(group)}
                  >
                    删除
                  </Button>
                </>
              ) : undefined
            }
          />

          <PermissionGroupTiles tiles={tiles} active={activeTab} onSelect={setTab} />

          <div className="mt-1">
            {activeTab === "members" && (
              <PermissionGroupMembersPanel
                workspaceSlug={workspaceSlug}
                group={group}
                canManage={canManage}
                members={members}
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
                    scopes={["project", "workspace"]}
                    value={editor.draft}
                    onChange={editor.setDraft}
                    typeOptions={editor.detail.type_options}
                    typeSourceLabel="类型库"
                    readOnly={readOnly}
                    notice={
                      !canManage || projectPermissionCount === 0 ? (
                        <div className="flex flex-col gap-2">
                          {!canManage && (
                            <div className="rounded-lg border border-subtle bg-layer-1 px-4 py-2.5 text-13 text-secondary">
                              你没有管理权限组的权限，只能查看。
                            </div>
                          )}
                          {projectPermissionCount === 0 && (
                            <div className="rounded-lg border border-warning-subtle bg-warning-subtle px-4 py-2.5 text-13 text-warning-primary">
                              {t(`${I18N}.data_scope.empty_project_permissions`)}
                            </div>
                          )}
                        </div>
                      ) : undefined
                    }
                    copySources={copySources}
                    loadCopySource={readOnly ? undefined : loadCopySource}
                  />
                  {editor.isDirty && !readOnly && (
                    <PermissionGroupSaveBar
                      count={editor.changedCount}
                      hint={saveHint}
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
