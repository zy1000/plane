import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Modal, message } from "antd";
import { FlaskConical } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Loader } from "@plane/ui";
// components
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import RepositoryModal from "@/components/qa/repository-modal";
import { DictionaryItemsPagination } from "@/components/workspace/settings/data-dictionaries/dictionary-items-pagination";
// hooks
import {
  useTemplateCaseRepositories,
  type TTemplateCaseRepository,
} from "@/hooks/store/use-template-case-repositories";
// local imports
import { useTemplatePermissions } from "../permissions";
import { ProductCategoryTag } from "../product-categories/product-category-tag";
import { TemplateLibraryTable } from "../template-library-table";
import { TemplatePageHeader, TemplatePageSearch } from "../template-page-header";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

type Props = {
  workspaceSlug: string;
};

export const TemplateCaseRepositoryList = observer(function TemplateCaseRepositoryList({ workspaceSlug }: Props) {
  const { t } = useTranslation();
  const { canManageCaseTemplates } = useTemplatePermissions(workspaceSlug);
  const {
    repositories,
    count,
    page,
    pageSize,
    search,
    isLoading,
    error,
    fetchPage,
    refreshCurrentPage,
    deleteRepositories,
  } = useTemplateCaseRepositories(workspaceSlug);

  const [searchInput, setSearchInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TTemplateCaseRepository | null>(null);

  // 服务端分页，搜索停顿 300ms 再请求
  useEffect(() => {
    const keyword = searchInput.trim();
    if (keyword === search) return;
    const timer = window.setTimeout(() => void fetchPage({ page: 1, search: keyword }).catch(() => undefined), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const confirmDelete = (repo: TTemplateCaseRepository) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定删除模板库“${repo.name}”吗？库内的模块与模板用例将一并删除，删除后不可恢复。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteRepositories([repo.id]);
          message.success("删除成功");
        } catch (e: any) {
          message.error(e?.message || e?.detail || e?.error || "删除失败，请稍后重试");
        }
      },
    });
  };

  const findRepository = (id: string) => repositories.find((repo) => repo.id === id);
  const isEmpty = !isLoading && !error && repositories.length === 0 && !search;
  const pageCount = Math.max(1, Math.ceil(count / pageSize));

  const renderBody = () => {
    if (error) {
      return (
        <div className="flex min-h-80 items-center justify-center p-6 text-center">
          <div>
            <h2 className="text-14 font-medium text-primary">{t("workspace_templates.test_cases.error_title")}</h2>
            <p className="mt-1 max-w-sm text-12 text-secondary">{error}</p>
            <Button className="mt-4" variant="secondary" onClick={() => void refreshCurrentPage()}>
              {t("retry")}
            </Button>
          </div>
        </div>
      );
    }
    if (isEmpty) {
      return (
        <div className="flex min-h-80 items-center justify-center p-6">
          <div className="flex max-w-sm flex-col items-center text-center">
            <FlaskConical className="size-12 text-placeholder" strokeWidth={1.25} aria-hidden="true" />
            <h2 className="mt-3 text-16 font-semibold text-primary">{t("workspace_templates.test_cases.empty.title")}</h2>
            <p className="mt-2 text-13 leading-5 text-secondary">{t("workspace_templates.test_cases.empty.description")}</p>
            {canManageCaseTemplates && (
              <Button className="mt-4" variant="primary" size="xl" onClick={openCreate}>
                新建用例库
              </Button>
            )}
          </div>
        </div>
      );
    }
    if (isLoading && repositories.length === 0) {
      return (
        <Loader className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Loader.Item key={index} height="48px" />
          ))}
        </Loader>
      );
    }
    if (repositories.length === 0) {
      return <div className="py-16 text-center text-13 text-tertiary">没有匹配的用例库</div>;
    }
    return (
      <>
        <TemplateLibraryTable
          rows={repositories.map((repo) => ({
            id: repo.id,
            name: repo.name,
            description: repo.description ?? "",
            href: `/${workspaceSlug}/templates/test-cases/${repo.id}`,
            tag: repo.product_category_detail ? <ProductCategoryTag name={repo.product_category_detail.name} /> : null,
            counts: [repo.case_count ?? 0, repo.module_count ?? 0],
            updatedAt: repo.updated_at,
          }))}
          columnLabels={{ tag: "产品模板", counts: ["用例数", "模块数"] }}
          onEdit={
            canManageCaseTemplates
              ? (id) => {
                  setEditing(findRepository(id) ?? null);
                  setModalOpen(true);
                }
              : undefined
          }
          onDelete={
            canManageCaseTemplates
              ? (id) => {
                  const repo = findRepository(id);
                  if (repo) confirmDelete(repo);
                }
              : undefined
          }
        />
        {count > PAGE_SIZE_OPTIONS[0] && (
          <div className="mt-3 overflow-hidden rounded-lg border border-subtle [&>footer]:border-t-0">
            <DictionaryItemsPagination
              total={count}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={(nextPage) => void fetchPage({ page: nextPage }).catch(() => undefined)}
              onPageSizeChange={(nextSize) => void fetchPage({ page: 1, pageSize: nextSize }).catch(() => undefined)}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <PageHead title={`${t("workspace_templates.test_cases.title")} - ${t("workspace_templates.title")}`} />
      <ContentWrapper className="flex min-h-0 flex-col bg-surface-1">
        <TemplatePageHeader
          title={t("workspace_templates.test_cases.title")}
          count={isLoading && repositories.length === 0 ? undefined : count}
        >
          <TemplatePageSearch value={searchInput} onChange={setSearchInput} placeholder="搜索用例库" />
          {canManageCaseTemplates && (
            <Button variant="primary" size="xl" className="px-3" onClick={openCreate}>
              新建用例库
            </Button>
          )}
        </TemplatePageHeader>
        <div className="px-7 py-6">{renderBody()}</div>
      </ContentWrapper>
      <RepositoryModal
        open={modalOpen}
        workspaceSlug={workspaceSlug}
        templateMode
        initialValues={editing}
        onCancel={() => setModalOpen(false)}
        onSuccess={() => void refreshCurrentPage()}
      />
    </>
  );
});
