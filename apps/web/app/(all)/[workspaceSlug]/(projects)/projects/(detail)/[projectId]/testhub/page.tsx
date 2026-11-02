import { Navigate, useParams } from "react-router";

// 项目「测试」首页原来是用例库列表；用例挪到产品后，进来直接到测试计划
export default function TestHubIndexPage() {
  const { workspaceSlug, projectId } = useParams();

  if (!workspaceSlug || !projectId) return null;

  return <Navigate to={`/${workspaceSlug}/projects/${projectId}/testhub/plans`} replace />;
}
