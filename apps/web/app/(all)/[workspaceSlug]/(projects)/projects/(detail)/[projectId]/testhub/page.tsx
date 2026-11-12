import { Navigate, useParams } from "react-router";

// 项目「测试」进来落在第一个页签「测试用例」（看的是关联产品的用例，由入口页挑默认产品）
export default function TestHubIndexPage() {
  const { workspaceSlug, projectId } = useParams();

  if (!workspaceSlug || !projectId) return null;

  return <Navigate to={`/${workspaceSlug}/projects/${projectId}/testhub/cases`} replace />;
}
