"use client";

import { useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageHead } from "@/components/core/page-title";
import UpdateModal from "@/components/qa/cases/update-modal";

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
      <div className="flex flex-shrink-0 items-center border-b border-subtle px-4 py-2">
        <Breadcrumbs className="grow-0">
          {/* 顶层：测试用例库（用例库列表） */}
          <Breadcrumbs.Item component={<BreadcrumbLink href={testhubUrl} label="测试用例库" />} />
          {/* 所属用例库：点击回到该库下的用例列表 */}
          <Breadcrumbs.Item
            component={<BreadcrumbLink href={repositoryCasesUrl} label={repositoryName || "…"} />}
          />
          {/* 当前用例名 */}
          <Breadcrumbs.Item
            isLast
            component={
              <span className="max-w-[320px] truncate text-sm font-medium text-primary">{caseName || "…"}</span>
            }
          />
        </Breadcrumbs>
      </div>
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
