/**
 * 项目需求页（/:ws/projects/:pid/requirements）。
 *
 * 展示的是**产品需求被本项目引用的那一份**：网格内容只读，项目能改的是关联关系
 * 与需求级交付状态。详情抽屉打到产品端点上 —— 当前用户对该产品有 can_edit 时
 * 可以在抽屉里改标题、字段和子表单，否则只读。
 *
 * 这与同一路径下曾经的「按工作项类别过滤的列表」不是一回事 ——
 * 那个页面（研发需求 /dev-requirements）已下线。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "react-router";
import {
  PROJECT_PRODUCT_LINK_MANAGE_PERMISSION_KEY,
  PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY,
  PROJECT_REQUIREMENT_LINK_VIEW_PERMISSION_KEY,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectRequirement, TRequirementItemStatus } from "@plane/types";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProductChip } from "@/components/products/product-chip";
import { PageHead } from "@/components/core/page-title";
import { isRequirementClosed } from "@/components/requirements";
import { ProjectRequirementModuleSidebar } from "@/components/requirements/module-tree";
import { RequirementPeekOverview } from "@/components/requirements/requirement-detail";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { useProject } from "@/hooks/store/use-project";
import { useProducts } from "@/hooks/store/use-products";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { useProductRequirementCanEdit } from "@/hooks/store/use-product-requirement-can-edit";
import { useProjectRequirements } from "@/hooks/store/use-project-requirements";
import { useRequirementModules } from "@/hooks/store/use-requirement-modules";
import { useUserPermissions } from "@/hooks/store/user";
import { RequirementService } from "@/services/requirement.service";
import { ExistingRequirementsModal } from "./existing-requirements-modal";
import {
  applyListQueryToSearchParams,
  listQueryToExpression,
  parseListQueryFromSearchParams,
  projectRequirementExpressionToQuery,
  serializeListQuery,
  useProjectRequirementFilter,
  useProjectRequirementFiltersConfig,
  type TProjectRequirementFilterExpression,
} from "./filters";
import { ProjectProductsModal } from "./project-products-modal";
import { PROJECT_REQUIREMENTS_HEADER_ACTIONS_ID } from "./project-requirement-filters";
import {
  PRODUCT_PARAM,
  getProductFromParam,
  moduleBelongsToProduct,
} from "./project-requirement-product-tabs";
import { ProjectRequirementsGrid } from "./project-requirements-grid";
import { UnlinkRequirementConfirmModal } from "./unlink-confirm-modal";

const requirementService = new RequirementService();

export const ProjectRequirementsPage = observer(function ProjectRequirementsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const slug = workspaceSlug?.toString();
  const project = projectId?.toString();

  const { getProjectById } = useProject();
  const { allowProjectPermissionKeys, workspaceUserInfo } = useUserPermissions();

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isProductsModalOpen, setIsProductsModalOpen] = useState(false);
  /** 待确认解除的行；非空即弹确认框，单行与批量共用同一条链路 */
  const [idsToUnlink, setIdsToUnlink] = useState<string[]>([]);
  const [dataToolbarHost, setDataToolbarHost] = useState<HTMLDivElement | null>(null);
  const [initialListQuery] = useState(() => parseListQueryFromSearchParams(searchParams));
  const [initialExpression] = useState(() => listQueryToExpression(initialListQuery));
  const syncedFilterRef = useRef(serializeListQuery(initialListQuery));

  useLayoutEffect(() => {
    setDataToolbarHost(document.getElementById(PROJECT_REQUIREMENTS_HEADER_ACTIONS_ID) as HTMLDivElement | null);
  }, []);

  const store = useProjectRequirements({
    workspaceSlug: slug,
    projectId: project,
    initialListQuery,
  });
  const {
    links: productLinks,
    isLoading: isProductLinksLoading,
    isMutating: isProductLinksMutating,
    updateProducts,
  } = useProjectProducts({ workspaceSlug: slug, projectId: project });
  // 关联产品弹窗的候选项。列表接口已按可见性过滤，后端还会再校验一次
  const { products, isLoading: isProductsLoading } = useProducts(slug);

  const moduleStore = useRequirementModules(slug, project ? { kind: "project", projectId: project } : undefined);

  // ?product= / ?moduleId= 与左侧栏选中双向同步。独立 URL 参数，不进 rich-filters
  // 的表达式序列化（applyListQueryToSearchParams 不认识它们，所以不会被筛选写入冲掉），
  // 与筛选在服务端 AND 叠加
  const allowedProductIds = isProductLinksLoading ? null : productLinks.map((link) => link.product);
  const urlProductId = getProductFromParam(searchParams.get(PRODUCT_PARAM), allowedProductIds) ?? null;
  const urlModuleId = searchParams.get("moduleId");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    () => getProductFromParam(searchParams.get(PRODUCT_PARAM), null) ?? null
  );
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(urlModuleId);
  const syncedProductRef = useRef(selectedProductId);
  const syncedModuleRef = useRef(urlModuleId);

  useEffect(() => {
    if (urlProductId === syncedProductRef.current) return;
    syncedProductRef.current = urlProductId;
    setSelectedProductId(urlProductId);
  }, [urlProductId]);

  useEffect(() => {
    if (urlModuleId === syncedModuleRef.current) return;
    syncedModuleRef.current = urlModuleId;
    setSelectedModuleId(urlModuleId);
  }, [urlModuleId]);

  // 产品和模块会在同一次点击里一起变（树节点：全部需求 / 产品 / 模块），必须一次写入 URL
  useEffect(() => {
    const urlProduct = searchParams.get(PRODUCT_PARAM);
    const productMatches = urlProduct === selectedProductId;
    const moduleMatches = urlModuleId === selectedModuleId;
    if (productMatches && moduleMatches) return;
    syncedProductRef.current = selectedProductId;
    syncedModuleRef.current = selectedModuleId;
    const next = new URLSearchParams(searchParams);
    if (selectedProductId) next.set(PRODUCT_PARAM, selectedProductId);
    else next.delete(PRODUCT_PARAM);
    if (selectedModuleId) next.set("moduleId", selectedModuleId);
    else next.delete("moduleId");
    setSearchParams(next, { replace: true });
  }, [selectedModuleId, selectedProductId, urlModuleId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedProductId || !selectedModuleId || moduleStore.isLoading) return;
    if (!moduleBelongsToProduct(moduleStore.groups, selectedProductId, selectedModuleId)) {
      setSelectedModuleId(null);
    }
  }, [moduleStore.groups, moduleStore.isLoading, selectedModuleId, selectedProductId]);

  const { setModuleId, setProductId } = store;
  useEffect(() => {
    setProductId(selectedProductId);
  }, [selectedProductId, setProductId]);
  useEffect(() => {
    setModuleId(selectedModuleId);
  }, [selectedModuleId, setModuleId]);

  const canView = allowProjectPermissionKeys([PROJECT_REQUIREMENT_LINK_VIEW_PERMISSION_KEY], slug ?? "", project ?? "");
  const canManage = allowProjectPermissionKeys(
    [PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY],
    slug ?? "",
    project ?? ""
  );
  const canManageProducts = allowProjectPermissionKeys(
    [PROJECT_PRODUCT_LINK_MANAGE_PERMISSION_KEY],
    slug ?? "",
    project ?? ""
  );

  /**
   * 分面计数随列表一起回来（后端塞在 extra_stats 里），不另发请求。
   * 口径见 utils/requirement_project.requirement_facets：by_product 恒为全集，
   * by_status / by_requirement_type 只跟随当前产品。
   */
  const facets = store.requirementsPage.extra_stats ?? null;
  /**
   * 项目侧 /products/ 不喂 status_counts，TProductProject.requirement_count 恒为 0。
   * 名单仍用关联行（0 条需求的产品也在）；条数叠 by_product，对得上 facets.total。
   */
  const productNavLinks = useMemo(() => {
    const counts = new Map((facets?.by_product ?? []).map((item) => [item.product_id, item.count]));
    if (counts.size === 0) return productLinks;
    return productLinks.map((link) => ({
      ...link,
      requirement_count: counts.get(link.product) ?? link.requirement_count ?? 0,
    }));
  }, [facets, productLinks]);

  const { areAllConfigsInitialized, configs } = useProjectRequirementFiltersConfig({
    workspaceSlug: slug ?? "",
    projectId: project ?? "",
    requirementTypes: store.requirementTypes,
  });

  const handleExpressionChange = useCallback(
    (expression: TProjectRequirementFilterExpression) => {
      const query = projectRequirementExpressionToQuery(expression);
      const snapshot = serializeListQuery(query);
      if (snapshot === syncedFilterRef.current) return;
      syncedFilterRef.current = snapshot;
      store.setListFilters(query);
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          applyListQueryToSearchParams(params, query);
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams, store.setListFilters]
  );

  const filter = useProjectRequirementFilter({
    instanceKey: project ?? "project-requirements",
    initialExpression,
    areAllConfigsInitialized,
    configs,
    onExpressionChange: handleExpressionChange,
  });

  // 前进后退改了筛选参数时，把表达式和列表 query 一起灌回去
  useEffect(() => {
    const next = parseListQueryFromSearchParams(searchParams);
    const snapshot = serializeListQuery(next);
    if (snapshot === syncedFilterRef.current) return;
    syncedFilterRef.current = snapshot;
    store.setListFilters(next);
    filter.resetExpression(listQueryToExpression(next));
  }, [filter, searchParams, store.setListFilters]);

  const urlPeekRequirementId = searchParams.get("peek");
  const [peekRequirementId, setPeekRequirement] = useState<string | null>(urlPeekRequirementId);
  /** 最后一次由本地态写出去的 peek，用来把「自己写的」和「外面改的」分开 */
  const syncedPeekRef = useRef(urlPeekRequirementId);

  /**
   * 前进后退、直接改地址栏：这个方向上 URL 是源。自己写出去的那一次要跳过，
   * 否则「点开后立刻关掉」时先前那次导航晚一步提交回来，会把抽屉重新弹开。
   */
  useEffect(() => {
    if (urlPeekRequirementId === syncedPeekRef.current) return;
    syncedPeekRef.current = urlPeekRequirementId;
    setPeekRequirement(urlPeekRequirementId);
  }, [urlPeekRequirementId]);

  /** 反方向补 URL。放在副作用里 = 抽屉先画出来，导航晚一帧再发生，不挡开合 */
  useEffect(() => {
    if (urlPeekRequirementId === peekRequirementId) return;
    syncedPeekRef.current = peekRequirementId;
    const next = new URLSearchParams(searchParams);
    if (peekRequirementId) next.set("peek", peekRequirementId);
    else next.delete("peek");
    setSearchParams(next, { replace: true });
  }, [peekRequirementId, urlPeekRequirementId, searchParams, setSearchParams]);

  const rows = store.requirementsPage.results;

  /**
   * 深链（带着 ?peek= 直接打开，或刷新页面）指向的那一行多半不在当前页里 ——
   * 列表是游标分页的，第 3 页的需求 id 在第 1 页的结果里找不到。只按当前页找会让抽屉
   * 打不开，然后在用户翻到那一页时毫无预兆地弹出来。
   *
   * 找不到就按 id 单独取一次（列表端点支持 ?ids=），取到的行只用来喂抽屉，不并进列表。
   */
  const [fetchedPeekRow, setFetchedPeekRow] = useState<TProjectRequirement | null>(null);
  const peekRow = useMemo(
    () =>
      rows.find((row) => row.id === peekRequirementId) ??
      (fetchedPeekRow?.id === peekRequirementId ? fetchedPeekRow : null),
    [fetchedPeekRow, peekRequirementId, rows]
  );
  const canEditPeek = useProductRequirementCanEdit({
    workspaceSlug: slug,
    productId: peekRow?.product_id ?? undefined,
  });

  useEffect(() => {
    if (!slug || !project || !peekRequirementId) return;
    if (rows.some((row) => row.id === peekRequirementId)) return;
    if (fetchedPeekRow?.id === peekRequirementId) return;

    let cancelled = false;
    void requirementService
      .listProjectRequirements(slug, project, { ids: [peekRequirementId], perPage: 1 })
      .then((response) => {
        if (cancelled) return;
        setFetchedPeekRow(response?.results?.[0] ?? null);
      })
      .catch(() => {
        // 取不到（已解除关联 / 无权限）就把 peek 收起来，不要留一个空抽屉
        if (!cancelled) setPeekRequirement(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchedPeekRow?.id, peekRequirementId, project, rows, slug]);

  const projectDetail = project ? getProjectById(project) : undefined;
  const pageTitle = projectDetail?.name
    ? `${projectDetail.name} - ${t("project_requirements.title")}`
    : t("project_requirements.title");

  const notifyFailure = (error: unknown) => {
    const payload = error as { error?: string } | null;
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t("error"),
      message: payload?.error ?? t("project_requirements.toast.failed"),
    });
  };

  const handleLink = async (requirementIds: string[]) => {
    await store.linkRequirements(requirementIds);
    // 关联进来的需求可能带来新模块 / 改变计数，左栏跟着刷
    void moduleStore.refresh().catch(() => undefined);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: t("project_requirements.toast.linked", { count: requirementIds.length }),
    });
  };

  const handleUnlink = async () => {
    if (!idsToUnlink.length) return;
    try {
      await store.unlinkRequirements(idsToUnlink);
      void moduleStore.refresh().catch(() => undefined);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_requirements.toast.unlinked") });
      // 解掉的那条可能正开着抽屉，它已经不在本项目里了
      if (peekRequirementId && idsToUnlink.includes(peekRequirementId)) setPeekRequirement(null);
      setIdsToUnlink([]);
    } catch (error) {
      notifyFailure(error);
    }
  };

  /**
   * 关联/解除工作项后只刷新这一行：工作项数与完成率是服务端注解，不重拉的话网格行
   * 和抽屉 seed 会停在旧值上。列表构成没变，不整页重拉。
   */
  const refreshRequirementRow = async (requirementId: string) => {
    if (!slug || !project) return;
    try {
      const response = await requirementService.listProjectRequirements(slug, project, {
        ids: [requirementId],
        perPage: 1,
      });
      const row = response?.results?.[0];
      if (!row) return;
      store.syncRequirements([row]);
      // 深链打开的行不在当前页里，喂抽屉的是 fetchedPeekRow，也要跟着换新
      setFetchedPeekRow((current) => (current?.id === row.id ? row : current));
    } catch {
      // 行刷新失败不打断主操作 —— 下一次列表拉取会补上
    }
  };

  const handleStatusChange = async (requirementId: string, status: TRequirementItemStatus) => {
    try {
      await store.updateStatus(requirementId, status);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("project_requirements.toast.status_updated", {
          status: t(`requirement_fields.statuses.${status}`),
        }),
      });
    } catch (error) {
      notifyFailure(error);
    }
  };

  if (!slug || !project) return null;

  // workspaceUserInfo 还没回来时不要抢先渲染 403：权限是异步取的，先渲染会闪一下
  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        <FiltersRow filter={filter} />

        {/* 左模块树 + 右网格。保持 min-h-0 / overflow-hidden 链路完整，
            否则网格的 sticky 表头与分页会被撑破（本页 layout 不包 ContentWrapper 滚动） */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ProjectRequirementModuleSidebar
            store={moduleStore}
            selectedModuleId={selectedModuleId}
            onSelect={setSelectedModuleId}
            productLinks={productNavLinks}
            isProductsLoading={isProductLinksLoading}
            selectedProductId={selectedProductId}
            onSelectProduct={setSelectedProductId}
            canManageProducts={canManageProducts}
            onManageProducts={() => setIsProductsModalOpen(true)}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ProjectRequirementsGrid
              requirementTypes={store.requirementTypes}
              requirements={rows}
              totalCount={store.requirementsPage.total_count ?? 0}
              perPage={store.perPage}
              nextCursor={store.requirementsPage.next_cursor}
              prevCursor={store.requirementsPage.prev_cursor}
              nextPageResults={store.requirementsPage.next_page_results}
              prevPageResults={store.requirementsPage.prev_page_results}
              isLoading={store.isRequirementsLoading || store.isConfigurationLoading}
              isMutating={store.isMutating}
              /*
               * 配置接口挂掉时也要说话：requirementTypes 会静默变空，类型列全是 —、
               * 类型筛选整个消失，但用户看不到任何解释
               */
              error={store.requirementsError ?? store.configurationError}
              onRetry={() => {
                void store.fetchConfiguration().catch(() => undefined);
                void store.fetchRequirements().catch(() => undefined);
              }}
              workspaceSlug={slug}
              projectId={project}
              canManage={canManage}
              canManageProducts={canManageProducts}
              onManageProducts={() => setIsProductsModalOpen(true)}
              /*
               * 请求还在飞、或者请求挂了的时候按「有产品」处理：这个标志只用来决定空态
               * 说哪句话、以及要不要禁用「关联需求」。宁可让人点开一个空的候选池，也
               * 不要在加载的那一瞬间把按钮变灰、把空态写成「先去关联产品」。
               */
              hasLinkedProducts={isProductLinksLoading || productLinks.length > 0}
              hasAnyLinked={(facets?.total ?? 0) > 0}
              activeFilterCount={filter.allConditionsForDisplay.length + (store.search.trim() ? 1 : 0)}
              onClearFilters={() => {
                void filter.clearFilters();
                store.setSearch("");
              }}
              search={store.search}
              onSearchChange={store.setSearch}
              onCursorChange={store.setCursor}
              onPerPageChange={store.setPerPage}
              onOpenDetail={setPeekRequirement}
              onLink={() => setIsLinkModalOpen(true)}
              onUnlink={setIdsToUnlink}
              onStatusChange={(requirementId, status) => void handleStatusChange(requirementId, status)}
              toolbarPortalEl={dataToolbarHost}
              toolbarAfterSearch={<FiltersToggle filter={filter} />}
            />
          </div>
        </div>
      </ContentWrapper>

      {/*
        详情抽屉打到**产品**的端点上：需求内容、版本、变更轨迹的权威都在产品。
        canEdit 看的是该产品的 policy.can_edit，不是项目权限 —— 项目成员不一定
        是产品成员，没权就继续只读，有权就能在抽屉里改字段和子表单。
        peekRow 作为 seed 传进去，抽屉就不必再为已经在页面上的行发一次请求。
      */}
      {peekRow && (
        <RequirementPeekOverview
          workspaceSlug={slug}
          productId={peekRow.product_id ?? ""}
          requirementId={peekRequirementId}
          requirementTypes={store.requirementTypes}
          rows={rows}
          canEdit={canEditPeek}
          onClose={() => setPeekRequirement(null)}
          onOpenRequirement={setPeekRequirement}
          onRequirementUpdated={(requirement) => {
            // 有产品编辑权限的人可以在抽屉里改挂靠，左侧只读模块树的计数要跟上
            const previous = rows.find((row) => row.id === requirement.id) ?? fetchedPeekRow;
            if (previous?.id === requirement.id && previous.module_id !== requirement.module_id) {
              void moduleStore.refresh().catch(() => undefined);
            }
            void refreshRequirementRow(requirement.id);
          }}
          /*
           * 复制链接仍指回本页 ?peek=。放大跳到产品需求整页 —— 项目里没有独立整页路由。
           * 没有所属产品时不渲染按钮，避免跳到空地址。
           */
          shareHref={(requirementId) => `${slug}/projects/${project}/requirements?peek=${requirementId}`}
          showDetailAction={Boolean(peekRow.product_id)}
          productChip={
            <ProductChip hideIdentifier identifier={peekRow.product_identifier} name={peekRow.product_name} />
          }
          /*
           * 项目侧的关联区与产品侧同一套（快捷操作条 + 有内容才出的折叠块），只是拆分 /
           * 关联直接落到本项目、用例候选池收窄到本项目。关联权限看项目，与内容可编辑是两道门。
           * 已关闭的需求不再拆分或新增关联（closed 行的解除靠服务端 409 兜底）。
           */
          relations={{
            projectId: project,
            canManage: canManage && !isRequirementClosed(peekRow),
            onChanged: () => void refreshRequirementRow(peekRow.id),
            linkedCycleIds: peekRow.linked_cycle_ids,
          }}
        />
      )}

      <ExistingRequirementsModal
        isOpen={isLinkModalOpen}
        workspaceSlug={slug}
        projectId={project}
        products={productLinks.map((link) => ({
          id: link.product,
          name: link.product_name,
          identifier: link.product_identifier,
        }))}
        handleClose={() => setIsLinkModalOpen(false)}
        onSubmit={handleLink}
      />

      <UnlinkRequirementConfirmModal
        isOpen={idsToUnlink.length > 0}
        isSubmitting={store.isMutating}
        count={idsToUnlink.length}
        handleClose={() => setIdsToUnlink([])}
        handleSubmit={() => void handleUnlink()}
      />

      {/*
        关联产品是整条链路的入口：不先把产品关联进来，需求候选池必然是空的。
        改完要把需求列表也刷一遍 —— 解除某个产品后，它下面的需求不该继续留在页面上
        （后端已经挡住了「还有需求关联着就不许解除」，这里刷新是为了拿到最新的候选池）。
      */}
      <ProjectProductsModal
        isOpen={isProductsModalOpen}
        products={products}
        isProductsLoading={isProductsLoading}
        links={productNavLinks}
        isSubmitting={isProductLinksMutating}
        handleClose={() => setIsProductsModalOpen(false)}
        onSubmit={async (payload) => {
          await updateProducts(payload);
          await store.fetchRequirements();
          void moduleStore.refresh().catch(() => undefined);
        }}
      />
    </>
  );
});
