import { useParams } from "next/navigation";
import { Outlet } from "react-router";
import {
  RequirementTemplateCreateModal,
  RequirementTemplatesProvider,
} from "@/components/template-management/requirements";

export default function RequirementTemplatesLayout() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  if (!slug) return null;

  return (
    <RequirementTemplatesProvider workspaceSlug={slug}>
      <Outlet />
      <RequirementTemplateCreateModal />
    </RequirementTemplatesProvider>
  );
}
