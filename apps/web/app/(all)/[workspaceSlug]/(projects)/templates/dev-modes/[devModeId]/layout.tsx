import { observer } from "mobx-react";
import { useParams } from "react-router";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { useTemplatePermissions } from "@/components/template-management";
import { DevModeDetailProvider, DevModeDetailShell } from "@/components/template-management/dev-modes";
import { useUserPermissions } from "@/hooks/store/user";

/**
 * 模式页的外层：拉一次详情供各子页共用，外壳负责头部与页签，子页进 Outlet。
 * 按模式 id 加 key：左栏里换模式时整棵重挂，选中的阶段、勾选草稿不会串到另一个模式。
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
    <DevModeDetailProvider key={modeId} workspaceSlug={slug} devModeId={modeId}>
      <DevModeDetailShell />
    </DevModeDetailProvider>
  );
});

export default DevModeDetailLayout;
