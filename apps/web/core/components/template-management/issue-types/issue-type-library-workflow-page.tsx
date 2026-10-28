import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Loader } from "@plane/ui";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { WorkflowTransitionsRoot } from "@/components/project-workflows/workflow-transitions";
import { useIssueTypeLibrary } from "@/hooks/store/use-issue-type-library";
import { ProjectWorkflowService } from "@/services/project/project-workflow.service";
import type { TWorkflow } from "@/services/project/project-workflow.service";
import { issueTypeLibraryPath } from "./routes";

const workflowService = new ProjectWorkflowService();

/** 类型库某条工作流的流转配置（同项目设置的工作流详情页），返回时回到原来选中的类型的「工作流」段 */
export function IssueTypeLibraryWorkflowPage({ workspaceSlug }: { workspaceSlug: string }) {
  const { workflowId } = useParams();
  const [searchParams] = useSearchParams();
  const { libraryError, scopeKey } = useIssueTypeLibrary(workspaceSlug);
  const [workflow, setWorkflow] = useState<TWorkflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!scopeKey || !workflowId) return;
    setIsLoading(true);
    workflowService
      .fetchWorkflows(workspaceSlug, scopeKey)
      .then((workflows) => setWorkflow(workflows.find((item) => item.id === workflowId) ?? null))
      .catch(() => setWorkflow(null))
      .finally(() => setIsLoading(false));
  }, [scopeKey, workflowId, workspaceSlug]);

  const backPath = issueTypeLibraryPath(workspaceSlug, { typeId: searchParams.get("type"), tab: "workflows" });

  return (
    <>
      <PageHead title="工作流 - 工作项类型 - 模板中心" />
      <ContentWrapper className="bg-surface-1">
        <div className="flex flex-col gap-4 px-8 py-6">
          <Link to={backPath} className="flex w-fit items-center gap-1 text-13 text-secondary hover:text-primary">
            <ArrowLeft className="size-3.5" />
            返回工作流
          </Link>
          {libraryError ? (
            <div className="py-16 text-center text-13 text-secondary">加载工作项类型库失败，请刷新重试。</div>
          ) : isLoading || !scopeKey ? (
            <Loader className="flex flex-col gap-3">
              <Loader.Item height="40px" width="40%" />
              <Loader.Item height="260px" />
            </Loader>
          ) : !workflow ? (
            <div className="py-16 text-center text-13 text-secondary">未找到工作流</div>
          ) : (
            <WorkflowTransitionsRoot workspaceSlug={workspaceSlug} projectId={scopeKey} workflow={workflow} />
          )}
        </div>
      </ContentWrapper>
    </>
  );
}
