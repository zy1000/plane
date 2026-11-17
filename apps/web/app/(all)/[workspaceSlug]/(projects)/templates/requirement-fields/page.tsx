import { observer } from "mobx-react";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { RequirementFieldLibraryPage } from "@/components/template-management/requirement-fields";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

/** 模板中心「需求通用字段库」：读 = 工作区成员（后端同口径），增删改另看 workspace.requirement_type.manage */
const TemplateRequirementFieldsPage = observer(function TemplateRequirementFieldsPage({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { workspaceInfoBySlug, isWorkspaceMember } = useUserPermissions();

  // 权限还没拉回来时不要闪一下「无权访问」
  if (workspaceInfoBySlug(workspaceSlug) && !isWorkspaceMember(workspaceSlug)) {
    return <NotAuthorizedView className="h-full" />;
  }

  return <RequirementFieldLibraryPage workspaceSlug={workspaceSlug} />;
});

export default function TemplateRequirementFieldsRoutePage({ params }: Route.ComponentProps) {
  return <TemplateRequirementFieldsPage workspaceSlug={params.workspaceSlug} />;
}
