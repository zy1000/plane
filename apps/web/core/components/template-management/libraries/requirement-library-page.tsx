import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Link, useParams, useSearchParams } from "react-router";
import { AlertCircle, Info, Library } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirementBatchSavePayload, TRequirementTypeSchema } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { RequirementExcelMenu } from "@/components/requirements/excel";
import { MoveToModuleModal, RequirementModuleSidebar } from "@/components/requirements/module-tree";
import { RequirementPeekOverview } from "@/components/requirements/requirement-detail";
import { RequirementGrid } from "@/components/requirements/requirement-grid";
import { getSettingsRequirementTypePath } from "@/components/workspace/settings/requirement-types/navigation";
import { useLibraryItems } from "@/hooks/store/use-library-items";
import { useRequirementModules } from "@/hooks/store/use-requirement-modules";
import { useRequirementLibrariesContext } from "./context";

/**
 * 标准库的条目页。
 *
 * 库直接持有条目，字段来自库所选类型（后端实时解析），条目读写走的接口与产品需求
 * 的明细完全同构，所以这里直接复用 RequirementGrid，不做任何分支。
 */
export const RequirementLibraryPage = observer(function RequirementLibraryPage() {
  const { t } = useTranslation();
  const { libraryId } = useParams();
  const { workspaceSlug, libraries } = useRequirementLibrariesContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dataToolbarHost, setDataToolbarHost] = useState<HTMLDivElement | null>(null);
  const store = useLibraryItems({ workspaceSlug, libraryId });

  // 列表缓存能让刷新前的首屏不闪空标题，接口回来后以 store 为准
  const library = store.library ?? libraries.find((item) => item.id === libraryId) ?? null;
  const pageTitle = library?.name ?? t("requirement_libraries.title");

  const moduleStore = useRequirementModules(workspaceSlug, libraryId ? { kind: "library", libraryId } : undefined);
  /** 批量移动弹窗的目标行；空数组 = 关着 */
  const [moveIds, setMoveIds] = useState<string[]>([]);

  // ?moduleId= 与选中模块双向同步（与下面 peek 的同款写法）
  const urlModuleId = searchParams.get("moduleId");
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(urlModuleId);
  const syncedModuleRef = useRef(urlModuleId);

  useEffect(() => {
    if (urlModuleId === syncedModuleRef.current) return;
    syncedModuleRef.current = urlModuleId;
    setSelectedModuleId(urlModuleId);
  }, [urlModuleId]);

  useEffect(() => {
    if (urlModuleId === selectedModuleId) return;
    syncedModuleRef.current = selectedModuleId;
    const next = new URLSearchParams(searchParams);
    if (selectedModuleId) next.set("moduleId", selectedModuleId);
    else next.delete("moduleId");
    setSearchParams(next, { replace: true });
  }, [selectedModuleId, urlModuleId, searchParams, setSearchParams]);

  const { setModuleId } = store;
  useEffect(() => {
    setModuleId(selectedModuleId);
  }, [selectedModuleId, setModuleId]);

  /** 新增 / 删除会改变模块计数与「全部」总数，纯更新不会 */
  const handleBulkSave = useCallback(
    async (payload: TRequirementBatchSavePayload) => {
      const response = await store.saveRequirementBatch(payload);
      if (payload.creates.length || payload.deletes.length) {
        void moduleStore.refresh().catch(() => undefined);
      }
      return response;
    },
    [store.saveRequirementBatch, moduleStore.refresh]
  );

  const urlPeekRequirementId = searchParams.get("peek");
  const [peekRequirementId, setPeekRequirement] = useState<string | null>(urlPeekRequirementId);
  const syncedPeekRef = useRef(urlPeekRequirementId);

  useEffect(() => {
    if (urlPeekRequirementId === syncedPeekRef.current) return;
    syncedPeekRef.current = urlPeekRequirementId;
    setPeekRequirement(urlPeekRequirementId);
  }, [urlPeekRequirementId]);

  useEffect(() => {
    if (urlPeekRequirementId === peekRequirementId) return;
    syncedPeekRef.current = peekRequirementId;
    const next = new URLSearchParams(searchParams);
    if (peekRequirementId) next.set("peek", peekRequirementId);
    else next.delete("peek");
    setSearchParams(next, { replace: true });
  }, [peekRequirementId, urlPeekRequirementId, searchParams, setSearchParams]);

  const requirementTypes = useMemo<TRequirementTypeSchema[]>(() => {
    if (!library) return [];
    return [
      {
        id: library.requirement_type_id,
        name: library.requirement_type_detail?.name ?? "",
        logo_props: library.requirement_type_detail?.logo_props,
        fields: store.configuration?.fields ?? [],
      },
    ];
  }, [library, store.configuration?.fields]);

  return (
    <>
      <PageHead title={`${pageTitle} - ${t("requirement_libraries.title")}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem className="min-w-0">
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      href={`/${workspaceSlug}/templates/libraries`}
                      label={t("requirement_libraries.title")}
                      icon={<Library className="size-4 text-secondary" />}
                    />
                  }
                />
                <Breadcrumbs.Item
                  component={
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-13 font-medium text-primary">{pageTitle}</span>
                      {library?.identifier && (
                        <span className="shrink-0 text-12 text-tertiary">{library.identifier}</span>
                      )}
                      {library && (
                        <Tooltip
                          tooltipContent={t("requirement_libraries.detail.requirement_type_tooltip")}
                          position="bottom"
                        >
                          <Link
                            to={getSettingsRequirementTypePath(workspaceSlug, library.requirement_type_id)}
                            className="max-w-48 shrink-0 truncate rounded-full bg-accent-primary/[0.08] px-2 py-0.5 text-11 text-accent-primary hover:bg-accent-primary/[0.14]"
                          >
                            {library.requirement_type_detail?.name}
                          </Link>
                        </Tooltip>
                      )}
                    </div>
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem className="shrink-0">
              <div className="flex min-w-0 items-center gap-2">
                {/* 网格自己的工具栏（搜索 / 筛选 / 显示 / 新增）portal 进这里 */}
                <div ref={setDataToolbarHost} className="flex min-w-0 items-center gap-2" />
                <RequirementExcelMenu
                  workspaceSlug={workspaceSlug}
                  scope="library"
                  entityId={libraryId ?? ""}
                  search={store.search}
                  filters={store.filters}
                  onImported={() => {
                    void store.fetchRequirements().catch(() => undefined);
                    // Excel 导入的行不挂模块，但「全部」的总数变了
                    void moduleStore.refresh().catch(() => undefined);
                  }}
                />
              </div>
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        {store.configurationError && !store.configuration ? (
          <div className="flex h-full min-h-80 items-center justify-center p-6 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
                <AlertCircle className="size-5" />
              </span>
              <h2 className="mt-3 text-14 font-medium text-primary">{t("requirement_libraries.detail.error_title")}</h2>
              <p className="mt-1 max-w-sm text-12 text-secondary">{store.configurationError}</p>
              <Button
                className="mt-4"
                variant="secondary"
                onClick={() => void store.fetchConfiguration().catch(() => undefined)}
              >
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <RequirementModuleSidebar
              store={moduleStore}
              selectedModuleId={selectedModuleId}
              onSelect={setSelectedModuleId}
            />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {library && (
                <div className="border-accent-primary/25 flex shrink-0 items-start gap-2 border-b bg-accent-primary/[0.06] px-4 py-2 text-12 text-primary">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-accent-primary" />
                  <span>
                    {t("requirement_libraries.items.fields_readonly_prefix")}
                    <Link
                      to={getSettingsRequirementTypePath(workspaceSlug, library.requirement_type_id)}
                      className="font-medium text-accent-primary hover:underline"
                    >
                      {library.requirement_type_detail?.name}
                    </Link>
                    {t("requirement_libraries.items.fields_readonly_suffix")}
                  </span>
                </div>
              )}
              <RequirementGrid
                workspaceSlug={workspaceSlug}
                entityId={libraryId ?? ""}
                entityKind="library"
                createRequirementTypeId={store.requirementTypeId ?? undefined}
                fields={store.configuration?.fields ?? []}
                requirements={store.requirementsPage.results}
                totalCount={store.requirementsPage.total_count ?? 0}
                totalPages={store.requirementsPage.total_pages ?? 0}
                nextCursor={store.requirementsPage.next_cursor}
                prevCursor={store.requirementsPage.prev_cursor}
                nextPageResults={store.requirementsPage.next_page_results}
                prevPageResults={store.requirementsPage.prev_page_results}
                isLoading={store.isConfigurationLoading || store.isRequirementsLoading}
                isMutating={store.isMutating}
                error={store.requirementsError}
                search={store.search}
                filters={store.filters}
                perPage={store.perPage}
                onSearchChange={store.setSearch}
                onFiltersChange={store.setFilters}
                onPerPageChange={store.setPerPage}
                onCursorChange={store.setCursor}
                onRefresh={store.fetchRequirements}
                onBulkSave={handleBulkSave}
                onOpenDetail={setPeekRequirement}
                toolbarPortalEl={dataToolbarHost}
                createModuleId={selectedModuleId}
                onMoveToModule={setMoveIds}
              />
            </div>
          </div>
        )}
      </ContentWrapper>
      <MoveToModuleModal
        isOpen={moveIds.length > 0}
        handleClose={() => setMoveIds([])}
        store={moduleStore}
        requirementIds={moveIds}
        onMoved={() => {
          void store.fetchRequirements().catch(() => undefined);
        }}
      />
      <RequirementPeekOverview
        workspaceSlug={workspaceSlug}
        libraryId={libraryId ?? ""}
        requirementId={peekRequirementId}
        requirementTypes={requirementTypes}
        rows={store.requirementsPage.results}
        canEdit
        showDetailAction={false}
        onClose={() => setPeekRequirement(null)}
        onOpenRequirement={setPeekRequirement}
        onRequirementUpdated={(requirement) => {
          // 抽屉里改了挂靠时左侧树计数要跟上；先比后刷，别为每次内容编辑都白拉一次树
          const previous = store.requirementsPage.results.find((row) => row.id === requirement.id);
          if (previous && previous.module_id !== requirement.module_id) {
            void moduleStore.refresh().catch(() => undefined);
          }
          store.syncRequirements([requirement]);
        }}
        shareHref={(requirementId) => `${workspaceSlug}/templates/libraries/${libraryId}?peek=${requirementId}`}
      />
    </>
  );
});
