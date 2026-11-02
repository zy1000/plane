import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { FlaskConical } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { RepositoryCasesView } from "@/components/qa/cases/repository-cases-view";
import { ProductCategoryTag } from "@/components/template-management/product-categories/product-category-tag";
// services
import { RepositoryService } from "@/services/qa/repository.service";
// testhub 全局枚举（用例类型/优先级/测试类型下拉依赖），项目侧由 testhub layout 初始化，模板侧在这里补
import {
  getEnums,
  globalEnums,
} from "@/components/qa/shared/testhub/util";

const repositoryService = new RepositoryService();

export default function TemplateCaseRepositoryPage() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug?.toString() ?? "";
  const repositoryId = params.repositoryId?.toString() ?? "";
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [repositoryName, setRepositoryName] = useState<string>("");
  // 绑定的产品模板：第一层模块由它统一维护
  const [productCategory, setProductCategory] = useState<{ id: string; name: string } | null>(null);
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);

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
    setProductCategory(null);
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
        setProductCategory(repository.product_category_detail ?? null);
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
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-13 font-medium text-primary">{repositoryName || "…"}</span>
                      {productCategory && (
                        <Link
                          to={`/${workspaceSlug}/templates/product?category=${productCategory.id}`}
                          className="flex min-w-0 max-w-40 shrink-0"
                        >
                          <ProductCategoryTag
                            name={productCategory.name}
                            className="h-auto rounded-full py-0.5 text-11 font-normal hover:text-primary"
                          />
                        </Link>
                      )}
                    </div>
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem className="shrink-0">
              <div ref={setToolbarHost} className="flex min-w-0 items-center gap-2" />
            </Header.RightItem>
          </Header>
        }
      />
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <RepositoryCasesView
          workspaceSlug={workspaceSlug}
          repositoryId={repositoryId}
          repositoryName={repositoryName}
          mode="template"
          toolbarPortalEl={toolbarHost}
          lockedRootCategoryName={productCategory?.name}
        />
      </div>
    </>
  );
}
