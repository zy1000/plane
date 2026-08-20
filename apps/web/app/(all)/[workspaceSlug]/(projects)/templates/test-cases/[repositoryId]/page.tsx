import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { FlaskConical } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { RepositoryCasesView } from "@/components/qa/cases/repository-cases-view";
// services
import { RepositoryService } from "@/services/qa/repository.service";
// testhub 全局枚举（用例类型/优先级/测试类型下拉依赖），项目侧由 testhub layout 初始化，模板侧在这里补
import {
  getEnums,
  globalEnums,
} from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";

const repositoryService = new RepositoryService();

export default function TemplateCaseRepositoryPage() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug?.toString() ?? "";
  const repositoryId = params.repositoryId?.toString() ?? "";
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [repositoryName, setRepositoryName] = useState<string>("");

  // 初始化全局枚举
  useEffect(() => {
    if (!workspaceSlug) return;
    getEnums(workspaceSlug)
      .then((enumTypes: any) => globalEnums.setEnums(enumTypes))
      .catch(() => undefined);
  }, [workspaceSlug]);

  // 取模板库名称并校验其存在；不存在（被删/不是模板库）则回列表
  useEffect(() => {
    if (!workspaceSlug || !repositoryId) return;
    let cancelled = false;
    repositoryService
      .getRepositories(workspaceSlug, { id: repositoryId, is_template: true })
      .then((response: any) => {
        if (cancelled) return;
        const repository = response?.data?.[0];
        if (!repository) {
          navigate(`/${workspaceSlug}/templates/test-cases`, { replace: true });
          return;
        }
        setRepositoryName(repository.name ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, repositoryId, navigate]);

  if (!workspaceSlug || !repositoryId) return null;

  const listTitle = t("workspace_templates.test_cases.title");

  return (
    <>
      {/* 文档标题由 RepositoryCasesView 内的 PageHead 负责（传入 repositoryName） */}
      <AppHeader
        header={
          <Header>
            <Header.LeftItem className="min-w-0">
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      href={`/${workspaceSlug}/templates/test-cases`}
                      label={listTitle}
                      icon={<FlaskConical className="size-4 text-secondary" />}
                    />
                  }
                />
                <Breadcrumbs.Item
                  component={
                    <span className="truncate text-13 font-medium text-primary">{repositoryName || "…"}</span>
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
          </Header>
        }
      />
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <RepositoryCasesView
          workspaceSlug={workspaceSlug}
          repositoryId={repositoryId}
          repositoryName={repositoryName}
          mode="template"
        />
      </div>
    </>
  );
}
