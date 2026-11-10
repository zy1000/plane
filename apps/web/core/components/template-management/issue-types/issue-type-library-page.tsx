import { useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Loader } from "@plane/ui";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { getApiErrorMessage, WorkItemTypeModal } from "@/components/project-issue-types/root";
import { useIssueTypeLibrary } from "@/hooks/store/use-issue-type-library";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import type { TIssueType } from "@/services/project/project-issue-type.service";
import { useTemplatePermissions } from "../permissions";
import { TemplatePageHeader, TemplatePageSearch } from "../template-page-header";
import { ISSUE_TYPE_LIBRARY_SEGMENTS, IssueTypeLibraryDetail } from "./issue-type-library-detail";
import { IssueTypeLibraryList } from "./issue-type-library-list";
import type { TIssueTypeLibrarySegment } from "./routes";

/**
 * 模板中心「工作项类型」：工作区唯一的类型库。页头下面左边一列选类型，右边看这个类型的属性 / 布局 / 状态 / 工作流。
 * 页头和类型列不动，只有右边详情滚动。
 *
 * 所有研发模式共用这一份类型、状态、工作流和字段，模式只关联其中一部分（模式页「工作项」页签）。
 * 选中项与分段放在 URL（?type= / ?tab=），刷新不丢，模式页「去类型库」也靠它直达。
 */
export const IssueTypeLibraryPage = observer(function IssueTypeLibraryPage({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { canManageDevModes: canEdit } = useTemplatePermissions(workspaceSlug);
  const { libraryError, scopeKey } = useIssueTypeLibrary(workspaceSlug);
  const issueTypesStore = useProjectIssueTypes(workspaceSlug, scopeKey);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [query, setQuery] = useState("");

  const issueTypes = scopeKey ? issueTypesStore.issueTypes : undefined;
  const selected = issueTypes?.find((item) => item.id === searchParams.get("type")) ?? issueTypes?.[0];
  const segment: TIssueTypeLibrarySegment =
    ISSUE_TYPE_LIBRARY_SEGMENTS.find((item) => item.key === searchParams.get("tab"))?.key ?? "props";

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const handleCreate = async (data: Partial<TIssueType>) => {
    setIsCreateSubmitting(true);
    try {
      const created = await issueTypesStore.createIssueType(data);
      setIsCreating(false);
      if (created) updateParams({ type: created.id });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "创建失败",
        message: getApiErrorMessage(error, "无法创建工作项类型，请稍后重试。"),
      });
    } finally {
      setIsCreateSubmitting(false);
    }
  };

  const renderDetail = () => {
    if (!scopeKey || issueTypes === undefined) {
      return (
        <Loader className="flex flex-col gap-4">
          <Loader.Item height="48px" width="40%" />
          <Loader.Item height="36px" width="30%" />
          <Loader.Item height="260px" />
        </Loader>
      );
    }
    if (!selected) return <div className="py-16 text-center text-13 text-tertiary">还没有工作项类型</div>;
    return (
      <IssueTypeLibraryDetail
        key={selected.id}
        workspaceSlug={workspaceSlug}
        scopeKey={scopeKey}
        issueType={selected}
        issueTypesStore={issueTypesStore}
        canEdit={canEdit}
        segment={segment}
        onSegmentChange={(next) => updateParams({ tab: next === "props" ? null : next })}
        onDeleted={() => updateParams({ type: null })}
      />
    );
  };

  return (
    <>
      <PageHead title="工作项类型 - 模板中心" />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        <TemplatePageHeader title="工作项类型" count={issueTypes?.length}>
          <TemplatePageSearch value={query} onChange={setQuery} placeholder="搜索类型" />
          {canEdit && scopeKey && (
            <Button variant="primary" size="xl" className="px-3" onClick={() => setIsCreating(true)}>
              新建类型
            </Button>
          )}
        </TemplatePageHeader>

        {libraryError ? (
          <div className="py-16 text-center text-13 text-secondary">加载工作项类型库失败，请刷新重试。</div>
        ) : (
          <div className="flex min-h-0 w-full flex-1">
            <div className="min-h-0 w-[200px] shrink-0 border-r border-subtle">
              <IssueTypeLibraryList
                issueTypes={issueTypes}
                query={query}
                selectedId={selected?.id}
                onSelect={(issueTypeId) => updateParams({ type: issueTypeId })}
              />
            </div>
            <section
              aria-label="类型详情"
              className="vertical-scrollbar scrollbar-sm min-h-0 min-w-0 flex-1 overflow-y-auto px-8 pt-6 pb-10"
            >
              {renderDetail()}
            </section>
          </div>
        )}
      </ContentWrapper>

      <WorkItemTypeModal
        isOpen={isCreating}
        isSubmitting={isCreateSubmitting}
        onClose={() => setIsCreating(false)}
        onSubmit={handleCreate}
        workspaceSlug={workspaceSlug}
      />
    </>
  );
});
