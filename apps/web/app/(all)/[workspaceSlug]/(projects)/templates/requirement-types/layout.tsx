import { useParams } from "next/navigation";
import { Outlet } from "react-router";
import {
  RequirementTypeCreateModal,
  RequirementTypesProvider,
} from "@/components/template-management/requirement-types";

export default function RequirementTypesLayout() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  if (!slug) return null;

  return (
    <RequirementTypesProvider workspaceSlug={slug}>
      <Outlet />
      <RequirementTypeCreateModal />
    </RequirementTypesProvider>
  );
}
