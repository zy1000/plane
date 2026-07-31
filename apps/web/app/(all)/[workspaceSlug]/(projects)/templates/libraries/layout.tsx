import { useParams } from "next/navigation";
import { Outlet } from "react-router";
import { RequirementLibrariesProvider, RequirementLibraryCreateModal } from "@/components/template-management/libraries";

export default function RequirementLibrariesLayout() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  if (!slug) return null;

  return (
    <RequirementLibrariesProvider workspaceSlug={slug}>
      <Outlet />
      <RequirementLibraryCreateModal />
    </RequirementLibrariesProvider>
  );
}
