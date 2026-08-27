import { useParams } from "react-router";
import { TemplateCaseRepositoryList } from "@/components/template-management";

export default function TemplateTestCasesPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  if (!slug) return null;

  return <TemplateCaseRepositoryList workspaceSlug={slug} />;
}
