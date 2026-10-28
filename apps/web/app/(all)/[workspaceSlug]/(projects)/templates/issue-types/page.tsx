import { observer } from "mobx-react";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { IssueTypeLibraryPage, useTemplatePermissions } from "@/components/template-management";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

const TemplateIssueTypesPage = observer(function TemplateIssueTypesPage({ workspaceSlug }: { workspaceSlug: string }) {
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewDevModes } = useTemplatePermissions(workspaceSlug);

  // 类型库与研发模式同一套权限（后端同样 403）
  if (workspaceInfoBySlug(workspaceSlug) && !canViewDevModes) return <NotAuthorizedView className="h-full" />;

  return <IssueTypeLibraryPage workspaceSlug={workspaceSlug} />;
});

export default function TemplateIssueTypesRoutePage({ params }: Route.ComponentProps) {
  return <TemplateIssueTypesPage workspaceSlug={params.workspaceSlug} />;
}
