import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useTemplatePermissions } from "@/components/template-management";
import { StageTypesRoot } from "@/components/workspace/settings/stage-types";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

/** 模板中心「阶段类型」（原 工作区设置 › 阶段类型）：读 = view / manage，增删改与后端同一把 manage */
const TemplateStageTypesPage = observer(function TemplateStageTypesPage({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewStageTypes, canManageStageTypes } = useTemplatePermissions(workspaceSlug);

  // 权限还没拉回来时不要闪一下「无权访问」
  if (workspaceInfoBySlug(workspaceSlug) && !canViewStageTypes) {
    return <NotAuthorizedView className="h-full" />;
  }

  return (
    <>
      <PageHead
        title={`${t("workspace_settings.settings.stage_types.title")} - ${t("workspace_templates.title")}`}
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        <StageTypesRoot workspaceSlug={workspaceSlug} canEdit={canManageStageTypes} />
      </ContentWrapper>
    </>
  );
});

export default function TemplateStageTypesRoutePage({ params }: Route.ComponentProps) {
  return <TemplateStageTypesPage workspaceSlug={params.workspaceSlug} />;
}
