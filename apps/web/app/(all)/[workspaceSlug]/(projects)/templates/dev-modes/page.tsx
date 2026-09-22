import { observer } from "mobx-react";
import { useParams } from "react-router";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { DevModeList, useTemplatePermissions } from "@/components/template-management";
import { useUserPermissions } from "@/hooks/store/user";

const TemplateDevModesPage = observer(function TemplateDevModesPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewDevModes } = useTemplatePermissions(slug);

  if (!slug) return null;
  if (workspaceInfoBySlug(slug) && !canViewDevModes) return <NotAuthorizedView className="h-full" />;

  return <DevModeList workspaceSlug={slug} />;
});

export default TemplateDevModesPage;
