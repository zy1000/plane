import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useOutletContext } from "react-router";
import { Pagination } from "antd";
import { ClipboardCheck, ClipboardList, Package, Settings2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Breadcrumbs, Header, Table } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { ProductSearch } from "@/components/product/search-products";
import { useRequirementModules } from "@/hooks/store/use-requirement-modules";
import { useUserRequirements } from "@/hooks/store/use-user-requirements";
import { useAppRouter } from "@/hooks/use-app-router";
import type {
  TRequirementModule,
  TRequirementType,
  TUserRequirementListParams,
  TUserRequirementListItem,
} from "@/services/requirement.service";
import type { TProductDetailOutletContext } from "../product-detail-layout";
import { DeleteRequirementModal } from "./delete-requirement-modal";
import type { TRequirementFilterKey } from "./requirement-filters";
import { RequirementFiltersRow, RequirementFiltersToggle } from "./requirement-filters";
import { RequirementFormModal } from "./requirement-form-modal";
import { RequirementModuleManagerModal } from "./requirement-module-manager-modal";
import { RequirementModuleSidebar } from "./requirement-module-sidebar";
import { getRequirementTableColumns } from "./requirement-table-columns";

type TRequirementsRootProps = {
  requirementType?: TRequirementType;
};

export const UserRequirementsRoot = observer(function UserRequirementsRoot(props: TRequirementsRootProps) {
  const { requirementType = "user" } = props;
  const { productId, workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const id = productId?.toString();
  const { error: productError, isLoading: isProductLoading, product } = useOutletContext<TProductDetailOutletContext>();
  const {
    createRequirement,
    deleteRequirement,
    error,
    fetchParentOptions,
    fetchRequirement,
    fetchRequirements,
    isLoading,
    requirements,
    totalCount,
    updateRequirement,
  } = useUserRequirements(slug, id, requirementType);
  const {
    createModule,
    deleteModule,
    fetchModules,
    isLoading: isModulesLoading,
    isMutating: isModuleMutating,
    modules,
    total: moduleTotal,
    updateModule,
  } = useRequirementModules(slug, id, requirementType);
  const router = useAppRouter();
  const isUserRequirement = requirementType === "user";
  const requirementLabel = isUserRequirement ? "用户需求" : "研发需求";
  const requirementPath = isUserRequirement ? "user-requirements" : "development-requirements";
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [isFiltersVisible, setIsFiltersVisible] = useState(false);
  const [activeFilterKeys, setActiveFilterKeys] = useState<TRequirementFilterKey[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<TUserRequirementListItem | null>(null);
  const [deletingRequirement, setDeletingRequirement] = useState<TUserRequirementListItem | null>(null);
  const [deletingModule, setDeletingModule] = useState<TRequirementModule | null>(null);
  const [isModuleManagerOpen, setIsModuleManagerOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => setPage(1), [assigneeId, debouncedSearch, moduleId, priority]);

  const listParams = useMemo<TUserRequirementListParams>(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      priority: priority || undefined,
      module: moduleId || undefined,
      assignee: assigneeId || undefined,
    }),
    [assigneeId, debouncedSearch, moduleId, page, pageSize, priority]
  );

  useEffect(() => {
    if (!slug || !id) return;
    void fetchRequirements(listParams).catch(() => undefined);
  }, [fetchRequirements, id, listParams, slug]);

  useEffect(() => {
    if (!slug || !id) return;
    void fetchModules().catch(() => undefined);
  }, [fetchModules, id, slug]);

  const columns = useMemo(
    () =>
      getRequirementTableColumns({
        onOpen: (requirement) => router.push(`/${slug}/products/${id}/${requirementPath}/${requirement.id}`),
        onEdit: (requirement) => {
          setEditingRequirement(requirement);
          setIsFormOpen(true);
        },
        onDelete: setDeletingRequirement,
      }),
    [id, requirementPath, router, slug]
  );

  if (!slug || !id) return null;

  const openCreate = () => {
    setEditingRequirement(null);
    setIsFormOpen(true);
  };

  const openEdit = (requirement: TUserRequirementListItem) => {
    setEditingRequirement(requirement);
    setIsFormOpen(true);
  };

  const refresh = () => fetchRequirements(listParams);
  const isBusy = isLoading;
  const hasFilters = !!(debouncedSearch || priority || moduleId || assigneeId);
  const hasAppliedFilters = !!(priority || moduleId || assigneeId);

  const addFilterKey = (key: TRequirementFilterKey) => {
    setActiveFilterKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
    setIsFiltersVisible(true);
  };

  const removeFilterKey = (key: TRequirementFilterKey) => {
    setActiveFilterKeys((keys) => keys.filter((item) => item !== key));
    if (key === "priority") setPriority("");
    if (key === "assignee") setAssigneeId(null);
  };

  const clearAllFilters = () => {
    setPriority("");
    setModuleId("");
    setAssigneeId(null);
  };

  const handleCreateModule = async (name: string) => {
    try {
      await createModule(name);
      void fetchModules();
      return true;
    } catch (error) {
      const duplicate =
        Array.isArray((error as { name?: unknown })?.name) &&
        (error as { name: string[] }).name.includes("REQUIREMENT_MODULE_NAME_ALREADY_EXISTS");
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "操作失败",
        message: duplicate ? "当前产品已存在同名模块。" : "请稍后重试。",
      });
      return false;
    }
  };

  return (
    <>
      <RequirementFormModal
        isOpen={isFormOpen}
        workspaceSlug={slug}
        productId={id}
        requirementLabel={requirementLabel}
        requirementId={editingRequirement?.id}
        modules={modules}
        fetchRequirement={fetchRequirement}
        fetchParentOptions={fetchParentOptions}
        onClose={() => {
          setIsFormOpen(false);
          setEditingRequirement(null);
        }}
        onSubmit={async (data) => {
          if (editingRequirement) {
            const updated = await updateRequirement(editingRequirement.id, data);
            void fetchModules();
            return updated;
          }
          const response = await createRequirement(data);
          void fetchModules();
          if (page !== 1) setPage(1);
          else await refresh();
          return response;
        }}
      />
      <DeleteRequirementModal
        requirement={deletingRequirement}
        onClose={() => setDeletingRequirement(null)}
        onDelete={async (requirementId) => {
          await deleteRequirement(requirementId);
          void fetchModules();
          if (requirements.length === 1 && page > 1) setPage((current) => current - 1);
          else await refresh();
        }}
      />
      <RequirementModuleManagerModal
        isOpen={isModuleManagerOpen}
        modules={modules}
        isMutating={isModuleMutating}
        onCreate={createModule}
        onUpdate={updateModule}
        onDelete={deleteModule}
        onClose={() => setIsModuleManagerOpen(false)}
        onChanged={() => {
          void refresh();
          void fetchModules();
        }}
      />
      <AlertModalCore
        isOpen={!!deletingModule}
        title="删除需求模块"
        content={`删除“${deletingModule?.name ?? ""}”后，使用该模块的需求会变为未分配模块。`}
        isSubmitting={isModuleMutating}
        handleClose={() => setDeletingModule(null)}
        handleSubmit={async () => {
          if (!deletingModule) return;
          const removedId = deletingModule.id;
          try {
            await deleteModule(removedId);
          } catch {
            setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: "请稍后重试。" });
            return;
          }
          setDeletingModule(null);
          if (moduleId === removedId) setModuleId("");
          else await refresh();
          void fetchModules();
        }}
      />

      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label="产品管理"
                      href={`/${slug}/products`}
                      icon={<Package className="size-4 text-tertiary" />}
                    />
                  }
                />
                {product && <Breadcrumbs.Item component={<BreadcrumbLink label={product.name} />} />}
                <Breadcrumbs.Item component={<BreadcrumbLink label={requirementLabel} />} />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem>
              <ProductSearch
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                placeholder={`搜索${requirementLabel}`}
              />
              <RequirementFiltersToggle
                isVisible={isFiltersVisible}
                hasAppliedFilters={hasAppliedFilters}
                onToggle={() => setIsFiltersVisible((visible) => !visible)}
              />
              <Button
                variant="secondary"
                size="lg"
                prependIcon={<ClipboardCheck className="size-4" />}
                onClick={() => router.push(`/${slug}/products/${id}/${requirementPath}/reviews`)}
              >
                我的评审
              </Button>
              <Button
                variant="secondary"
                size="lg"
                prependIcon={<Settings2 className="size-4" />}
                onClick={() => setIsModuleManagerOpen(true)}
              >
                管理模块
              </Button>
              <Button variant="primary" size="lg" onClick={openCreate}>
                创建{requirementLabel}
              </Button>
            </Header.RightItem>
          </Header>
        }
      />

      <ContentWrapper>
        <PageHead title={product ? `${product.name} - ${requirementLabel}` : requirementLabel} />
        {isProductLoading ? (
          <div className="h-full animate-pulse space-y-2 rounded-md border border-subtle bg-surface-1 p-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-12 rounded bg-layer-1" />
            ))}
          </div>
        ) : productError || !product ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-15 font-medium text-primary">无法打开{requirementLabel}</p>
              <p className="mt-1 text-13 text-secondary">产品不存在，或你没有访问权限。</p>
            </div>
          </div>
        ) : (
          <div className="relative flex h-full min-h-0 overflow-hidden bg-layer-1 text-secondary">
            <RequirementModuleSidebar
              modules={modules}
              total={moduleTotal}
              selectedModuleId={moduleId}
              isLoading={isModulesLoading}
              isMutating={isModuleMutating}
              onSelect={setModuleId}
              onDeleteModule={setDeletingModule}
              onCreateModule={handleCreateModule}
            />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <RequirementFiltersRow
                isVisible={isFiltersVisible}
                activeKeys={activeFilterKeys}
                priority={priority}
                assigneeId={assigneeId}
                totalCount={totalCount}
                onAddFilter={addFilterKey}
                onRemoveFilter={removeFilterKey}
                onPriorityChange={setPriority}
                onAssigneeChange={setAssigneeId}
                onClearAll={clearAllFilters}
              />

              {isBusy ? (
                <div className="flex-1 animate-pulse space-y-2 bg-surface-1 p-3">
                  {[0, 1, 2, 3, 4, 5].map((item) => (
                    <div key={item} className="h-11 rounded bg-layer-1" />
                  ))}
                </div>
              ) : error ? (
                <div className="grid flex-1 place-items-center bg-surface-1 text-center">
                  <div>
                    <p className="text-15 font-medium text-primary">{requirementLabel}加载失败</p>
                    <p className="mt-1 text-13 text-secondary">请检查网络后重试。</p>
                    <Button variant="secondary" size="lg" className="mt-4" onClick={() => void refresh()}>
                      重新加载
                    </Button>
                  </div>
                </div>
              ) : requirements.length === 0 ? (
                <div className="grid flex-1 place-items-center bg-surface-1 p-6 text-center">
                  <div className="max-w-sm">
                    <span className="mx-auto grid size-12 place-items-center rounded-xl border border-subtle bg-layer-1">
                      <ClipboardList className="size-5 text-secondary" />
                    </span>
                    <h2 className="mt-4 text-16 font-semibold text-primary">
                      {hasFilters ? "没有匹配的需求" : `还没有${requirementLabel}`}
                    </h2>
                    <p className="mt-1 text-13 leading-5 text-secondary">
                      {hasFilters
                        ? "调整筛选条件或搜索关键词后重试。"
                        : "记录真实用户场景，让产品决策和研发交付有清晰依据。"}
                    </p>
                    {!hasFilters && (
                      <Button variant="primary" size="lg" className="mt-4" onClick={openCreate}>
                        创建第一个{requirementLabel}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="vertical-scrollbar horizontal-scrollbar scrollbar-lg min-h-0 flex-1 overflow-auto bg-surface-1">
                    <Table<TUserRequirementListItem>
                      columns={columns}
                      data={requirements}
                      keyExtractor={(row) => row.id}
                      tableClassName="min-w-full table-fixed border-separate border-spacing-0 bg-surface-1 whitespace-nowrap"
                      tHeadClassName="sticky top-0 z-[12] border-b-[0.5px] border-subtle divide-y-0"
                      tHeadTrClassName="divide-x-0"
                      thClassName="h-11 border-r border-subtle bg-layer-1 px-3 py-1 text-left text-13 font-medium"
                      tBodyClassName="divide-y-0"
                      tBodyTrClassName="group divide-x-0 bg-surface-1 transition-[background-color] hover:bg-layer-1/60"
                      tdClassName="h-11 border-b-[0.5px] border-r border-subtle p-0 align-middle text-13"
                    />
                  </div>
                  <div className="flex shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
                    <span className="text-12 text-secondary">
                      第 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} 条，共 {totalCount} 条
                    </span>
                    <Pagination
                      simple
                      current={page}
                      pageSize={pageSize}
                      total={totalCount}
                      showSizeChanger
                      pageSizeOptions={["10", "20", "50", "100"]}
                      onChange={(nextPage, nextSize) => {
                        setPage(nextSize !== pageSize ? 1 : nextPage);
                        setPageSize(nextSize);
                      }}
                      size="small"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </ContentWrapper>
    </>
  );
});
