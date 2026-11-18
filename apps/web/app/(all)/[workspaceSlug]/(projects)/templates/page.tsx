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
  // 按左栏顺序（研发模式 → 资产库 → 模板库）落到第一个有权看的入口；研发模式落在「全部模式对比」
  const { canViewLibraries, canViewCaseTemplates, canViewReviewTemplates, canViewDevModes, canViewRequirementTypes } =
    useTemplatePermissions(workspaceSlug);
  const tabKey = canViewDevModes
    ? "dev-modes"
    : canViewLibraries
      ? "libraries"
      : canViewCaseTemplates
        ? "test-cases"
        : canViewReviewTemplates
          ? "reviews"
          : canViewRequirementTypes
            ? "requirement-types"
            : "dev-modes";
  return <Navigate to={getTemplateManagementTabPath(workspaceSlug, tabKey)} replace />;
});

export default function TemplateManagementIndexRoutePage({ params }: Route.ComponentProps) {
  return <TemplateManagementIndexPage workspaceSlug={params.workspaceSlug} />;
}
