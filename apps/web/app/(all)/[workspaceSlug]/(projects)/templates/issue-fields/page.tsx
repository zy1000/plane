import { observer } from "mobx-react";
import { useParams } from "react-router";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { IssueFieldLibraryPage } from "@/components/template-management/issue-fields";
import { useTemplatePermissions } from "@/components/template-management/permissions";
import { useUserPermissions } from "@/hooks/store/user";

/** 模板中心「通用字段」：工作区字段库，读写口径同研发模式（view / manage） */
const TemplateIssueFieldsPage = observer(function TemplateIssueFieldsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewDevModes } = useTemplatePermissions(slug);

  if (!slug) return null;
  // 权限还没拉回来时不要闪一下「无权访问」
  if (workspaceInfoBySlug(slug) && !canViewDevModes) return <NotAuthorizedView className="h-full" />;

  return <IssueFieldLibraryPage workspaceSlug={slug} />;
});

export default TemplateIssueFieldsPage;
