/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";

type TProps = {
  errorStatusCode: number | undefined;
};

/**
 * 进不了项目时的整页提示。没有「加入」了：看不见的项目（不是成员、不在任何工作区权限组的白名单里）
 * 后端一律 403，想进只能由项目经理添加为成员。
 */
export const ProjectAccessRestriction = observer(function ProjectAccessRestriction(props: TProps) {
  const { errorStatusCode } = props;
  // plane hooks
  const { t } = useTranslation();

  // 403：没有权限看这个项目
  if (errorStatusCode === 403) {
    return (
      <div className="grid h-full w-full place-items-center bg-surface-1">
        <EmptyStateDetailed
          title={t("project_empty_state.no_access.title")}
          description={t("project_empty_state.no_access.restricted_description")}
          assetKey="no-access"
          assetClassName="size-40"
        />
      </div>
    );
  }

  // Show empty state screen if:
  // - Project not found (404 Not Found)
  // - Any other error status code
  return (
    <div className="grid h-full w-full place-items-center bg-surface-1">
      <EmptyStateDetailed
        title={t("project_empty_state.invalid_project.title")}
        description={t("project_empty_state.invalid_project.description")}
        assetKey="project"
        assetClassName="size-40"
      />
    </div>
  );
});
