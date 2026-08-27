import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { FlaskConical } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { PageHead } from "@/components/core/page-title";
import UpdateModal from "@/components/qa/cases/update-modal";

/** 模板用例全屏（独立页面）详情：与抽屉共用同一套展示结构（UpdateModal 的 page 形态，templateMode） */
export default function TemplateCaseDetailPage() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug?.toString() ?? "";
  const caseId = params.caseId?.toString() ?? "";
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 面包屑数据：来自 UpdateModal 内部加载的用例详情（含所属模板库与用例名）
  const [caseName, setCaseName] = useState<string>("");
  const [repositoryId, setRepositoryId] = useState<string>("");
  const [repositoryName, setRepositoryName] = useState<string>("");

  const handleCaseDataChange = useCallback((data: any) => {
    setCaseName(String(data?.name ?? ""));
    setRepositoryId(String(data?.repository ?? data?.repository_id ?? ""));
    setRepositoryName(String(data?.repository_name ?? ""));
  }, []);

  if (!workspaceSlug || !caseId) return null;

  const listTitle = t("workspace_templates.test_cases.title");
  const listUrl = `/${workspaceSlug}/templates/test-cases`;
  const repositoryUrl = repositoryId ? `${listUrl}/${repositoryId}` : listUrl;

  return (
    <>
      <PageHead title={caseName || "用例详情"} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem className="min-w-0">
              <Breadcrumbs>
                {/* 顶层：模板用例库列表 */}
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      href={listUrl}
                      label={listTitle}
                      icon={<FlaskConical className="size-4 text-secondary" />}
                    />
                  }
                />
                {/* 所属模板库：点击回到该库的用例列表 */}
                <Breadcrumbs.Item component={<BreadcrumbLink href={repositoryUrl} label={repositoryName || "…"} />} />
                {/* 当前用例名 */}
                <Breadcrumbs.Item
                  component={
                    <span className="max-w-[320px] truncate text-13 font-medium text-primary">{caseName || "…"}</span>
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
          </Header>
        }
      />
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <UpdateModal
          open
          variant="page"
          templateMode
          caseId={caseId}
          workspaceSlug={workspaceSlug}
          onClose={() => navigate(repositoryUrl)}
          onCaseDataChange={handleCaseDataChange}
        />
      </div>
    </>
  );
}
