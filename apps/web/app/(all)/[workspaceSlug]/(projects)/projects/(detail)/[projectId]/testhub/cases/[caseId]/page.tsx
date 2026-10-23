"use client";

import { useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageHead } from "@/components/core/page-title";
import UpdateModal from "@/components/qa/cases/update-modal";
import { TestHubEntityBar } from "@/components/qa/shared/testhub-entity-bar";
import { FileText } from "lucide-react";

/** 用例全屏（独立页面）详情：与抽屉共用同一套展示结构（UpdateModal 的 page 形态） */
export default function TestCaseDetailPage() {
  const { workspaceSlug, projectId, caseId } = useParams();
  const router = useRouter();
  const ws = String(workspaceSlug || "");
  const pid = String(projectId || "");
  const id = String(caseId || "");

  // 面包屑数据：来自 UpdateModal 内部加载的用例详情（含所属用例库与用例名）
  const [caseName, setCaseName] = useState<string>("");
  const [repositoryId, setRepositoryId] = useState<string>("");
  const [repositoryName, setRepositoryName] = useState<string>("");

  const handleCaseDataChange = useCallback((data: any) => {
    setCaseName(String(data?.name ?? ""));
    setRepositoryId(String(data?.repository ?? data?.repository_id ?? ""));
    setRepositoryName(String(data?.repository_name ?? ""));
  }, []);

  if (!ws || !pid || !id) return null;

  const testhubUrl = `/${ws}/projects/${pid}/testhub`;
  const repositoryCasesUrl = repositoryId
    ? `${testhubUrl}/cases?repositoryId=${encodeURIComponent(repositoryId)}`
    : `${testhubUrl}/cases`;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <PageHead title={caseName || "用例详情"} />
      {/* 实体栏：「测试用例」页签已在上方，这里只放所属用例库和当前用例 */}
      <TestHubEntityBar icon={<FileText className="size-4" strokeWidth={1.75} />}>
        <Breadcrumbs.Item component={<BreadcrumbLink href={repositoryCasesUrl} label={repositoryName || "…"} />} />
        <Breadcrumbs.Item component={<TestHubEntityBar.Current>{caseName || "…"}</TestHubEntityBar.Current>} />
      </TestHubEntityBar>
      <div className="min-h-0 flex-1 overflow-hidden">
        <UpdateModal
          open
          variant="page"
          caseId={id}
          workspaceSlug={ws}
          projectId={pid}
          onClose={() => router.push(repositoryCasesUrl)}
          onCaseDataChange={handleCaseDataChange}
        />
      </div>
    </div>
  );
}
