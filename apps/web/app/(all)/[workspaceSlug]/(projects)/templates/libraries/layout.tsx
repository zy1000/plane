import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import { Outlet } from "react-router";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { useTemplatePermissions } from "@/components/template-management";
import { RequirementLibrariesProvider, RequirementLibraryFormModal } from "@/components/template-management/libraries";
import { useUserPermissions } from "@/hooks/store/user";

const RequirementLibrariesLayout = observer(function RequirementLibrariesLayout() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewLibraries } = useTemplatePermissions(slug);

  if (!slug) return null;
  // 只有用例模板库权限的人直接敲这条 URL 也要挡住（后端同样 403）
  if (workspaceInfoBySlug(slug) && !canViewLibraries) return <NotAuthorizedView className="h-full" />;

  return (
    <RequirementLibrariesProvider workspaceSlug={slug}>
      <Outlet />
      <RequirementLibraryFormModal />
    </RequirementLibrariesProvider>
  );
});

export default RequirementLibrariesLayout;
