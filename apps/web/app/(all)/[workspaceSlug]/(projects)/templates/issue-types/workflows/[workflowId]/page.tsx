import { observer } from "mobx-react";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { IssueTypeLibraryWorkflowPage, useTemplatePermissions } from "@/components/template-management";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

/** 类型库下某条工作流的流转配置 */
const TemplateIssueTypeWorkflowPage = observer(function TemplateIssueTypeWorkflowPage({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewDevModes } = useTemplatePermissions(workspaceSlug);

  if (workspaceInfoBySlug(workspaceSlug) && !canViewDevModes) return <NotAuthorizedView className="h-full" />;

  return <IssueTypeLibraryWorkflowPage workspaceSlug={workspaceSlug} />;
});

export default function TemplateIssueTypeWorkflowRoutePage({ params }: Route.ComponentProps) {
  return <TemplateIssueTypeWorkflowPage workspaceSlug={params.workspaceSlug} />;
}
