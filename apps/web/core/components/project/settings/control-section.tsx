/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Archive, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useParams } from "react-router";
// plane imports
import { PROJECT_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
// local imports
import { ArchiveRestoreProjectModal } from "../archive-restore-modal";
import { DeleteProjectModal } from "../delete-project-modal";
import { ProjectSettingsGroup } from "./general/field-group";

type Props = {
  projectId: string;
};

type TDangerRowProps = {
  icon: LucideIcon;
  danger?: boolean;
  title: string;
  description: string;
  action: ReactNode;
};

/** 危险操作卡片里的一行：图标块 + 标题 / 说明 + 右侧按钮 */
function DangerRow(props: TDangerRowProps) {
  const { icon: Icon, danger = false, title, description, action } = props;
  return (
    <div className="flex items-center gap-4 px-5 py-4.5">
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          danger ? "bg-danger-subtle text-danger-primary" : "bg-layer-2 text-tertiary"
        )}
      >
        <Icon className="size-4.25" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-14 font-semibold text-primary">{title}</span>
        <span className="mt-0.5 block text-13 text-tertiary">{description}</span>
      </span>
      <span className="shrink-0">{action}</span>
    </div>
  );
}

/** 项目设置常规页最后的「危险操作」：归档 / 删除两行；只给管理员看，页面在非管理员时不渲染 */
export const GeneralProjectSettingsControlSection = observer(function GeneralProjectSettingsControlSection(
  props: Props
) {
  const { projectId } = props;
  // states
  const [selectProject, setSelectedProject] = useState<string | null>(null);
  const [archiveProject, setArchiveProject] = useState<boolean>(false);
  // params
  const { workspaceSlug } = useParams();
  // store hooks
  const { currentProjectDetails } = useProject();
  // translation
  const { t } = useTranslation();

  if (!currentProjectDetails) return null;

  return (
    <ProjectSettingsGroup title={t("project_settings.general.groups.danger")}>
      {workspaceSlug && (
        <ArchiveRestoreProjectModal
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          isOpen={archiveProject}
          onClose={() => setArchiveProject(false)}
          archive
        />
      )}
      <DeleteProjectModal
        project={currentProjectDetails}
        isOpen={Boolean(selectProject)}
        onClose={() => setSelectedProject(null)}
      />
      <div className="divide-y divide-subtle rounded-xl border border-subtle bg-surface-1">
        <DangerRow
          icon={Archive}
          title={t("project_settings.general.archive_project.title")}
          description={t("project_settings.general.archive_project.description")}
          action={
            <Button variant="secondary" size="xl" className="h-9.5 px-4 text-14" onClick={() => setArchiveProject(true)}>
              {t("project_settings.general.archive_project.button")}
            </Button>
          }
        />
        <DangerRow
          icon={Trash2}
          danger
          title={t("project_settings.general.delete_project.title")}
          description={t("project_settings.general.delete_project.description")}
          action={
            <Button
              variant="error-outline"
              size="xl"
              className="h-9.5 px-4 text-14"
              onClick={() => setSelectedProject(currentProjectDetails.id ?? null)}
              data-ph-element={PROJECT_TRACKER_ELEMENTS.DELETE_PROJECT_BUTTON}
            >
              {t("project_settings.general.delete_project.button")}
            </Button>
          }
        />
      </div>
    </ProjectSettingsGroup>
  );
});
