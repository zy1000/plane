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
  // 按 tab 顺序落到第一个有权看的页签：只有研发模式权限的人别往标准库落地
  const { canViewLibraries, canViewCaseTemplates, canViewReviewTemplates } = useTemplatePermissions(workspaceSlug);
  const tabKey = canViewLibraries
    ? "libraries"
    : canViewCaseTemplates
      ? "test-cases"
      : canViewReviewTemplates
        ? "reviews"
        : "dev-modes";
  return <Navigate to={getTemplateManagementTabPath(workspaceSlug, tabKey)} replace />;
});

export default function TemplateManagementIndexRoutePage({ params }: Route.ComponentProps) {
  return <TemplateManagementIndexPage workspaceSlug={params.workspaceSlug} />;
}
