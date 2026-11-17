import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useRequirementTypes } from "@/hooks/store/use-requirement-types";
import { useTemplatePermissions } from "../permissions";
import { RequirementTypesList } from "./requirement-types-list";

/**
 * 模板中心「需求类型」：类型列表。点进某个类型是它的字段配置页（RequirementTypeEditor）。
 * 读 = 工作区成员（路由页已拦），增删改与后端同一把 key（workspace.requirement_type.manage）。
 */
export const RequirementTypesPage = observer(function RequirementTypesPage({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation();
  const { canManageRequirementTypes } = useTemplatePermissions(workspaceSlug);
  const {
    requirementTypes,
    isLoading,
    isMutating,
    error,
    fetchRequirementTypes,
    createRequirementType,
    updateRequirementType,
    deleteRequirementType,
  } = useRequirementTypes(workspaceSlug);

  return (
    <>
      <PageHead
        title={`${t("workspace_settings.settings.requirement_types.title")} - ${t("workspace_templates.title")}`}
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        <RequirementTypesList
          workspaceSlug={workspaceSlug}
          canEdit={canManageRequirementTypes}
          requirementTypes={requirementTypes}
          isLoading={isLoading}
          isMutating={isMutating}
          error={error}
          fetchRequirementTypes={fetchRequirementTypes}
          createRequirementType={createRequirementType}
          updateRequirementType={updateRequirementType}
          deleteRequirementType={deleteRequirementType}
        />
      </ContentWrapper>
    </>
  );
});
