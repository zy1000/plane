import { Outlet } from "react-router";
// components
import { TemplateManagementTopNavigation } from "@/components/template-management";
// local imports
import type { Route } from "./+types/layout";

export default function TemplateManagementLayout({ params }: Route.ComponentProps) {
  return (
    <>
      <TemplateManagementTopNavigation workspaceSlug={params.workspaceSlug} />
      <Outlet />
    </>
  );
}
