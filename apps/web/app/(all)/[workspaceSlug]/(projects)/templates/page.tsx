import { observer } from "mobx-react";
import { Navigate } from "react-router";
// components
import { getTemplateManagementTabPath, useTemplatePermissions } from "@/components/template-management";
// local imports
import type { Route } from "./+types/page";

const TemplateManagementIndexPage = observer(function TemplateManagementIndexPage({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  // 按 tab 顺序落到第一个有权看的库：只有评审模板库权限的人别往标准库落地
  const { canViewLibraries, canViewCaseTemplates } = useTemplatePermissions(workspaceSlug);
  const tabKey = canViewLibraries ? "libraries" : canViewCaseTemplates ? "test-cases" : "reviews";
  return <Navigate to={getTemplateManagementTabPath(workspaceSlug, tabKey)} replace />;
});

export default function TemplateManagementIndexRoutePage({ params }: Route.ComponentProps) {
  return <TemplateManagementIndexPage workspaceSlug={params.workspaceSlug} />;
}
