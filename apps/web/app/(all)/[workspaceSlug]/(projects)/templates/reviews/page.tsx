import { observer } from "mobx-react";
import { useParams } from "react-router";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { StageReviewTemplateList, useTemplatePermissions } from "@/components/template-management";
import { useUserPermissions } from "@/hooks/store/user";

const TemplateReviewsPage = observer(function TemplateReviewsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewReviewTemplates } = useTemplatePermissions(slug);

  if (!slug) return null;
  if (workspaceInfoBySlug(slug) && !canViewReviewTemplates) return <NotAuthorizedView className="h-full" />;

  return <StageReviewTemplateList workspaceSlug={slug} />;
});

export default TemplateReviewsPage;
