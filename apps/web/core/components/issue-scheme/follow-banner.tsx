/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Lock } from "lucide-react";
import { observer } from "mobx-react";
import { Link } from "react-router";
// plane imports
import { Button } from "@plane/propel/button";
// components
import { TypeIcon } from "@/components/common/type-icon-picker";
import { issueTypeLibraryBasePath } from "@/components/template-management/issue-types/routes";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { IssueSchemeDetachModal } from "./detach-modal";

const PROJECT_SETTINGS_EDIT_KEY = "project.settings.edit";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * 跟随研发模式时挂在项目设置「工作项类型 / 状态 / 工作流」三页顶部的说明条（docs/issue-scheme/ 5.2）：
 * 这三页只读，改配置去模板中心的工作项类型库；有项目设置编辑权限的人可以切换为项目自定义（单向）。
 * 项目自定义时不渲染。
 */
export const IssueSchemeFollowBanner = observer(function IssueSchemeFollowBanner({ workspaceSlug, projectId }: Props) {
  const { getProjectById } = useProject();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const [isDetachOpen, setIsDetachOpen] = useState(false);

  const project = getProjectById(projectId);
  if (!project || project.issue_scheme_detail?.is_project_owned !== false) return null;

  const devMode = project.dev_mode_detail;
  const canDetach = allowProjectPermissionKeys([PROJECT_SETTINGS_EDIT_KEY], workspaceSlug, projectId);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2.5 text-13 text-warning-primary">
        <Lock className="size-3.5 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span>此项目的工作项配置跟随研发模式</span>
          {devMode && (
            <>
              <TypeIcon iconProps={devMode.icon_props?.icon} className="size-4 rounded" iconClassName="size-2.5" />
              <span className="font-medium">{devMode.name}</span>
            </>
          )}
          <span>，这里只能查看。</span>
          <Link to={issueTypeLibraryBasePath(workspaceSlug)} className="underline underline-offset-2">
            去模板中心修改
          </Link>
        </span>
        {canDetach && (
          <Button variant="secondary" size="lg" onClick={() => setIsDetachOpen(true)}>
            切换为项目自定义
          </Button>
        )}
      </div>
      <IssueSchemeDetachModal
        isOpen={isDetachOpen}
        workspaceSlug={workspaceSlug}
        project={project}
        devModeName={devMode?.name}
        onClose={() => setIsDetachOpen(false)}
      />
    </>
  );
});
