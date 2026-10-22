import { observer } from "mobx-react";
import { useParams } from "react-router";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { DevModesOverview, useTemplatePermissions } from "@/components/template-management";
import { useUserPermissions } from "@/hooks/store/user";

/** 模板中心左栏的「全部模式对比」：各模式的组件开关与阶段路线并排对比 */
const TemplateDevModesPage = observer(function TemplateDevModesPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewDevModes } = useTemplatePermissions(slug);

  if (!slug) return null;
  if (workspaceInfoBySlug(slug) && !canViewDevModes) return <NotAuthorizedView className="h-full" />;

  return <DevModesOverview />;
});

export default TemplateDevModesPage;
