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
  // 只有用例模板库权限的人别往标准库落地
  const { canViewLibraries } = useTemplatePermissions(workspaceSlug);
  return (
    <Navigate to={getTemplateManagementTabPath(workspaceSlug, canViewLibraries ? "libraries" : "test-cases")} replace />
  );
});

export default function TemplateManagementIndexRoutePage({ params }: Route.ComponentProps) {
  return <TemplateManagementIndexPage workspaceSlug={params.workspaceSlug} />;
}
