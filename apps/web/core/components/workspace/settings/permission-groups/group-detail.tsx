/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useSearchParams } from "react-router";
import useSWR from "swr";
import { PERMISSION_KEYS } from "@plane/constants";
import type { TPermissionScope } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPermissionGroup, TPermissionGroupKind } from "@plane/types";
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
import {
  DATA_SCOPE_MODE_LABELS,
  PERMISSION_GROUP_KIND_LABELS,
  PERMISSION_GROUP_KIND_TABS,
  PROJECT_KEY_TOTAL,
  getPermissionGroupDefaultTab,
  getPermissionGroupErrorMessage,
  getPermissionGroupsPath,
} from "./helpers";
import type { TPermissionGroupDetailTab } from "./helpers";
import { PermissionGroupSaveBar } from "./save-bar";
import { TemplateProjectsPanel } from "./template-projects-panel";
import { PermissionGroupIdentity, PermissionGroupKindTag, PermissionGroupTiles, countDepartments } from "./ui";
import type { TDetailTile } from "./ui";

const I18N = "workspace_settings.settings.roles";

const READ_KEYS = [
  PERMISSION_KEYS.WORKSPACE_PERMISSION_GROUP_VIEW,
  PERMISSION_KEYS.WORKSPACE_PERMISSION_GROUP_MANAGE,
  PERMISSION_KEYS.WORKSPACE_MEMBER_MANAGE,
];

/** 权限编辑器显示哪几段：工作区组两段，模板只有项目权限；数据权限没有权限页签 */
const EDITOR_SCOPES: Record<TPermissionGroupKind, TPermissionScope[]> = {
  workspace: ["project", "workspace"],
  project_template: ["project"],
  data: [],
};

/**
 * 权限组详情：头部（标题旁类型标签）+ 两张数字卡片（兼做页签），按类型不同：
 * 工作区权限组「权限 / 成员」、项目权限模板「项目权限 / 引用项目」、数据权限「数据权限 / 成员」。
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
  const { data: fetchedRoles } = useSWR(
    canView ? `WORKSPACE_PERMISSION_GROUPS_${workspaceSlug}` : null,
    canView ? fetchRoles : null,
    { revalidateOnFocus: false }
  );
  const group: IPermissionGroup | undefined = roles.find((role) => role.id === roleId);
  const kind = group?.kind;
  // 组没了（被删 / 刷新失败）回列表时还能落到原来的分段
  const lastKindRef = useRef<TPermissionGroupKind | undefined>(kind);
  if (kind) lastKindRef.current = kind;
  const tabs: TPermissionGroupDetailTab[] = kind ? PERMISSION_GROUP_KIND_TABS[kind] : [];
  const hasTab = (tab: TPermissionGroupDetailTab) => tabs.includes(tab);

  // 每块只在该类型下发请求：kind 还没拿到（列表未回）时都先不拉
  const editor = usePermissionGroupDetail(workspaceSlug, roleId, canView && hasTab("permissions"));
  const dataScope = usePermissionGroupDataScope(workspaceSlug, roleId, canView && hasTab("data-scope"));
  const templateProjects = usePermissionGroupTemplateProjects(workspaceSlug, roleId, canView && hasTab("referenced"));
  const members = usePermissionGroupMembers(workspaceSlug, roleId, canView && hasTab("members"));

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IPermissionGroup | null>(null);

  const referencingCount = useMemo(
    () => templateProjects.projects.filter((project) => !project.excluded).length,
    [templateProjects.projects]
  );
  const excludedCount = templateProjects.projects.length - referencingCount;
  // 不用 useMemo：成员详情晚于成员 id 到达时要跟着重算（observer 会重渲）
  const departmentCount = countDepartments(members.memberIds, getUserDetails);
  const memberCount =
    members.isLoading && members.memberIds.length === 0 ? (group?.member_count ?? 0) : members.memberIds.length;

  // 权限卡片跟草稿走：勾了还没保存也能看到数字在变
  const draftKeys = editor.draft?.permission_keys;
  const projectPermissionCount = draftKeys
    ? draftKeys.filter((key) => key.startsWith("project.")).length
    : (group?.project_permission_count ?? 0);
  const workspacePermissionCount = draftKeys
    ? draftKeys.filter((key) => key.startsWith("workspace.")).length
    : (group?.workspace_permission_count ?? 0);

  const tiles = useMemo<TDetailTile<TPermissionGroupDetailTab>[]>(() => {
    if (!group) return [];
    const membersTile: TDetailTile<TPermissionGroupDetailTab> = {
      key: "members",
      label: "成员",
      value: memberCount,
      unit: "人",
      sub: departmentCount > 0 ? `来自 ${departmentCount} 个部门` : undefined,
    };
    switch (group.kind) {
      case "project_template":
        return [
          {
            key: "permissions",
            label: "项目权限",
            value: projectPermissionCount,
            unit: "项",
            sub: `共 ${PROJECT_KEY_TOTAL} 项`,
          },
          {
            key: "referenced",
            label: t(`${I18N}.referenced_projects`),
            value:
              templateProjects.isLoading && templateProjects.projects.length === 0
                ? (group.referenced_project_count ?? 0)
                : referencingCount,
            unit: "个",
            sub: excludedCount > 0 ? `已移除 ${excludedCount} 个` : undefined,
          },
        ];
      case "data": {
        const projectsScope = group.data_scope_summary?.projects;
        const productsScope = group.data_scope_summary?.products;
        const productText =
          !productsScope || productsScope.mode === "all" ? "产品全部" : `产品 ${productsScope.count ?? 0} 个`;
        return [
          {
            key: "data-scope",
            label: t(`${I18N}.data_scope.title`),
            value: projectsScope?.count ?? "—",
            unit: "个项目",
            sub: `${DATA_SCOPE_MODE_LABELS[projectsScope?.mode ?? "all"]} · ${productText}`,
          },
          membersTile,
        ];
      }
      default:
        return [
          {
            key: "permissions",
            label: "权限",
            value: projectPermissionCount + workspacePermissionCount,
            unit: "项",
            sub: `项目 ${projectPermissionCount} · 工作区 ${workspacePermissionCount}`,
          },
          membersTile,
        ];
    }
  }, [
    group,
    projectPermissionCount,
    workspacePermissionCount,
    memberCount,
    departmentCount,
    templateProjects.isLoading,
    templateProjects.projects.length,
    referencingCount,
    excludedCount,
    t,
  ]);

  // URL ?tab= 不是这个类型的页签时回落到默认页签
  const requestedTab = searchParams.get("tab") as TPermissionGroupDetailTab | null;
  const activeTab: TPermissionGroupDetailTab | null = !kind
    ? null
    : requestedTab && hasTab(requestedTab)
      ? requestedTab
      : getPermissionGroupDefaultTab(kind);
  const setTab = (tab: TPermissionGroupDetailTab) => setSearchParams({ tab }, { replace: true });

  // 列表拉回来后还找不到这个组：可能是别处刚建的，单独取一次；取不到（被删了 / id 不对）就回列表
  useEffect(() => {
    if (!fetchedRoles || group) return;
    void refreshRole(roleId).catch(() => navigate(getPermissionGroupsPath(workspaceSlug, lastKindRef.current)));
  }, [fetchedRoles, group, roleId, refreshRole, navigate, workspaceSlug]);

  // 编辑器里的「复制自…」只列同类型的组
  const copySources = useMemo<TCopySource[]>(
    () =>
      roles
        .filter((role) => role.id !== roleId && role.kind === kind)
        .map((role) => ({ id: role.id, name: role.name })),
    [roles, roleId, kind]
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
  const listPath = getPermissionGroupsPath(workspaceSlug, kind);
  const updater = group?.updated_by ? getUserDetails(group.updated_by) : undefined;
  const meta = group?.updated_at
    ? `${updater?.display_name ? `${updater.display_name} ` : ""}更新于 ${renderFormattedPayloadDate(group.updated_at)}`
    : null;
  const readOnly = !canManage || !editor.detail?.is_editable;
  const saveHint =
    kind === "project_template"
      ? referencingCount > 0
        ? `保存后 ${referencingCount} 个引用项目同步生效`
        : undefined
      : memberCount > 0
        ? `保存后对组内 ${memberCount} 人立即生效`
        : undefined;

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
      <PageHead title={group ? `${PERMISSION_GROUP_KIND_LABELS[group.kind]} - ${group.name}` : "权限组"} />
      {!group || !kind || !activeTab ? (
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="36px" width="240px" />
          <Loader.Item height="96px" />
          <Loader.Item height="480px" />
        </Loader>
      ) : (
        <div className="flex flex-col gap-5">
          <PermissionGroupIdentity
            name={group.name}
            badge={<PermissionGroupKindTag kind={kind} />}
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
                    scopes={EDITOR_SCOPES[kind]}
                    value={editor.draft}
                    onChange={editor.setDraft}
                    typeOptions={editor.detail.type_options}
                    typeSourceLabel="类型库"
                    readOnly={readOnly}
                    notice={
                      !canManage ? (
                        <div className="rounded-lg border border-subtle bg-layer-1 px-4 py-2.5 text-13 text-secondary">
                          你没有管理权限组的权限，只能查看。
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
                      hint={saveHint}
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
            // kind 创建后不可改，这里只送名称 / 描述
            await updateRole(group.id, { name: value.name, description: value.description });
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
          navigate(getPermissionGroupsPath(workspaceSlug, target.kind));
        }}
      />
    </SettingsContentWrapper>
  );
});
