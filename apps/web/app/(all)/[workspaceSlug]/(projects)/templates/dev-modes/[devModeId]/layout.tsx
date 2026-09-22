import { observer } from "mobx-react";
import { useParams } from "react-router";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { useTemplatePermissions } from "@/components/template-management";
import { DevModeDetailProvider, DevModeDetailShell } from "@/components/template-management/dev-modes";
import { useUserPermissions } from "@/hooks/store/user";

/**
 * 模式详情的外层：拉一次详情供两个子页共用，外壳负责头部与子页签，子页进 Outlet。
 */
const DevModeDetailLayout = observer(function DevModeDetailLayout() {
  const { workspaceSlug, devModeId } = useParams();
  const slug = workspaceSlug?.toString();
  const modeId = devModeId?.toString();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewDevModes } = useTemplatePermissions(slug);

  if (!slug || !modeId) return null;
  if (workspaceInfoBySlug(slug) && !canViewDevModes) return <NotAuthorizedView className="h-full" />;

  return (
    <DevModeDetailProvider workspaceSlug={slug} devModeId={modeId}>
      <DevModeDetailShell />
    </DevModeDetailProvider>
  );
});

export default DevModeDetailLayout;
