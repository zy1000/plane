import { observer } from "mobx-react";
import { useParams } from "react-router";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { DevModeDetailRoot, useTemplatePermissions } from "@/components/template-management";
import { useUserPermissions } from "@/hooks/store/user";

const TemplateDevModeDetailPage = observer(function TemplateDevModeDetailPage() {
  const { workspaceSlug, devModeId } = useParams();
  const slug = workspaceSlug?.toString();
  const modeId = devModeId?.toString();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewDevModes } = useTemplatePermissions(slug);

  if (!slug || !modeId) return null;
  if (workspaceInfoBySlug(slug) && !canViewDevModes) return <NotAuthorizedView className="h-full" />;

  return <DevModeDetailRoot workspaceSlug={slug} devModeId={modeId} />;
});

export default TemplateDevModeDetailPage;
