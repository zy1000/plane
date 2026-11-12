import { useParams } from "react-router";
import { ProjectProductEntry } from "@/components/qa/shared/testhub/project-product-entry";

// 项目「用例评审」页签的入口：内容是关联产品的，这里挑出默认产品再进去
export default function ProjectReviewsEntryPage() {
  const { workspaceSlug, projectId } = useParams();

  if (!workspaceSlug || !projectId) return null;

  return <ProjectProductEntry workspaceSlug={workspaceSlug} projectId={projectId} target="reviews" />;
}
