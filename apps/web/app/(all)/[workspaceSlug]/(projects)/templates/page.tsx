import { Navigate } from "react-router";
// components
import { getTemplateManagementTabPath } from "@/components/template-management";
// local imports
import type { Route } from "./+types/page";

export default function TemplateManagementIndexPage({ params }: Route.ComponentProps) {
  return <Navigate to={getTemplateManagementTabPath(params.workspaceSlug, "libraries")} replace />;
}
