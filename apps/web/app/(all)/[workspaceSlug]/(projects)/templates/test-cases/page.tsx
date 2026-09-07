import { observer } from "mobx-react";
import { useParams } from "react-router";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { TemplateCaseRepositoryList, useTemplatePermissions } from "@/components/template-management";
import { useUserPermissions } from "@/hooks/store/user";

const TemplateTestCasesPage = observer(function TemplateTestCasesPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewCaseTemplates } = useTemplatePermissions(slug);

  if (!slug) return null;
  if (workspaceInfoBySlug(slug) && !canViewCaseTemplates) return <NotAuthorizedView className="h-full" />;

  return <TemplateCaseRepositoryList workspaceSlug={slug} />;
});

export default TemplateTestCasesPage;
