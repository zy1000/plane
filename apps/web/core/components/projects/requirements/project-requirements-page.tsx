/**
 * 项目需求页（/:ws/projects/:pid/requirements）。
 *
 * 展示的是**产品需求被本项目引用的那一份**：内容只读，项目能改的只有关联关系本身
 * 与需求级交付状态（人工维护、跨项目共享一份），想改内容只能提变更单（走产品现有的
 * 审批名单）。这与同一路径下曾经的「按工作项类别过滤的列表」不是一回事 ——
 * 那个页面（研发需求 /dev-requirements）已下线。
 *
 * 详情抽屉复用产品侧的 RequirementPeekOverview 并传 productId={row.product_id}：
 * 需求内容、版本、变更轨迹的权威都在产品，项目侧不该另开一套读路径。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { PageHead } from "@/components/core/page-title";
import { ProductChip } from "@/components/products/product-chip";
import { isRequirementClosed } from "@/components/requirements";
import { RequirementIssuesSection, RequirementPeekOverview } from "@/components/requirements/requirement-detail";
import { useProject } from "@/hooks/store/use-project";
import { useProducts } from "@/hooks/store/use-products";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { useProjectRequirements } from "@/hooks/store/use-project-requirements";
import { useUserPermissions } from "@/hooks/store/user";
import { useSearchParamFilter } from "@/hooks/use-search-param-filter";
import { RequirementService } from "@/services/requirement.service";
import { ExistingRequirementsModal } from "./existing-requirements-modal";
import { ProjectProductsModal } from "./project-products-modal";
import { getProductFromParam, PRODUCT_PARAM } from "./project-requirement-product-tabs";
import {
  PROJECT_REQUIREMENTS_HEADER_ACTIONS_ID,
  ProjectRequirementFiltersRow,
  ProjectRequirementFiltersToggle,
} from "./project-requirement-filters";
import { getStatusFromParam, STATUS_PARAM } from "./project-requirement-status-filter";
import {
  getTypeFromParam,
  ProjectRequirementTypeFilter,
  TYPE_PARAM,
} from "./project-requirement-type-filter";
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
  const [isFilterVisible, setIsFilterVisible] = useState(() =>
    Boolean(getStatusFromParam(searchParams.get(STATUS_PARAM)))
  );
  const [isStatusChipVisible, setIsStatusChipVisible] = useState(() =>
    Boolean(getStatusFromParam(searchParams.get(STATUS_PARAM)))
  );

  useLayoutEffect(() => {
    setDataToolbarHost(
      document.getElementById(PROJECT_REQUIREMENTS_HEADER_ACTIONS_ID) as HTMLDivElement | null
    );
  }, []);

  const store = useProjectRequirements({ workspaceSlug: slug, projectId: project });
  const {
    links: productLinks,
    isLoading: isProductLinksLoading,
    isMutating: isProductLinksMutating,
    updateProducts,
  } = useProjectProducts({ workspaceSlug: slug, projectId: project });
  // 关联产品弹窗的候选项。列表接口已按可见性过滤，后端还会再校验一次
  const { products, isLoading: isProductsLoading } = useProducts(slug);

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

  // 三个筛选与 URL 双向绑定：刷新、前进后退、分享链接都能还原当前视图
  useSearchParamFilter({
    param: PRODUCT_PARAM,
    value: store.productFilter,
    setValue: store.setProductFilter,
    // 以 productLinks 为准（方案 A 常驻条的数据源），加载中先放行深链
    parse: (raw) =>
      getProductFromParam(
        raw,
        isProductLinksLoading ? null : productLinks.map((link) => link.product)
      ),
  });
  useSearchParamFilter({
    param: STATUS_PARAM,
    value: store.statusFilter,
    setValue: store.setStatusFilter,
    parse: getStatusFromParam,
  });
  useSearchParamFilter({
    param: TYPE_PARAM,
    value: store.requirementTypeFilter,
    setValue: store.setRequirementTypeFilter,
    parse: (raw) => getTypeFromParam(raw, store.requirementTypes),
  });

  // 深链 / 前进后退带了 status 时，把 chip 亮出来；空值（--）不算筛选，不自动藏
  useEffect(() => {
    if (store.statusFilter) setIsStatusChipVisible(true);
  }, [store.statusFilter]);

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
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: t("project_requirements.toast.linked", { count: requirementIds.length }),
    });
  };

  const handleUnlink = async () => {
    if (!idsToUnlink.length) return;
    try {
      await store.unlinkRequirements(idsToUnlink);
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
        {(store.requirementTypes.length >= 2 || Boolean(store.requirementTypeFilter)) && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-subtle px-4 py-2">
            <ProjectRequirementTypeFilter
              requirementTypes={store.requirementTypes}
              counts={facets?.by_requirement_type}
              value={store.requirementTypeFilter}
              onChange={store.setRequirementTypeFilter}
            />
          </div>
        )}

        <ProjectRequirementFiltersRow
          isVisible={isFilterVisible}
          showStatusChip={isStatusChipVisible}
          statusValue={store.statusFilter}
          statusCounts={facets?.by_status}
          totalCount={
            store.productFilter
              ? (facets?.by_product.find((item) => item.product_id === store.productFilter)?.count ?? 0)
              : (facets?.total ?? 0)
          }
          onStatusChange={store.setStatusFilter}
          onAddStatus={() => setIsStatusChipVisible(true)}
          onRemoveStatus={() => {
            store.setStatusFilter(undefined);
            setIsStatusChipVisible(false);
          }}
        />

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
          activeFilterCount={
            [store.productFilter, store.statusFilter, store.requirementTypeFilter].filter(Boolean).length
          }
          onClearFilters={() => {
            store.setProductFilter(undefined);
            store.setStatusFilter(undefined);
            store.setRequirementTypeFilter(undefined);
            store.setSearch("");
            setIsStatusChipVisible(false);
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
          toolbarAfterSearch={
            <ProjectRequirementFiltersToggle
              hasConditions={isStatusChipVisible}
              isVisible={isFilterVisible}
              onToggle={() => setIsFilterVisible((visible) => !visible)}
            />
          }
        />
      </ContentWrapper>

      {/*
        详情抽屉打到**产品**的端点上：需求内容、版本、变更轨迹的权威都在产品。
        canEdit 恒 false —— 项目侧对需求内容没有任何写入口。
        peekRow 作为 seed 传进去，抽屉就不必再为已经在页面上的行发一次请求。
      */}
      {peekRow && (
        <RequirementPeekOverview
          workspaceSlug={slug}
          productId={peekRow.product_id ?? ""}
          requirementId={peekRequirementId}
          requirementTypes={store.requirementTypes}
          rows={rows}
          canEdit={false}
          onClose={() => setPeekRequirement(null)}
          onOpenRequirement={setPeekRequirement}
          /*
           * 复制链接要指回本页的 ?peek=，而不是产品的整页 —— 分享出去的应该是收件人
           * 能看到的这个视图。「打开整页」直接隐藏：需求在项目里没有整页路由，跳去
           * 产品整页会把人弹出项目上下文。
           */
          shareHref={(requirementId) => `${slug}/projects/${project}/requirements?peek=${requirementId}`}
          showDetailAction={false}
          productChip={
            <ProductChip identifier={peekRow.product_identifier} name={peekRow.product_name} />
          }
          /*
           * 关联工作项 Section 只在项目侧注入：拆分/关联/解除都要项目语境，产品侧
           * 抽屉没有。预填取列表行 —— 项目侧看到的就是已通过评审的那一版内容，
           * linked_cycle_ids 注解也只有它带。
           * 已关闭的需求不再拆分/关联新工作项（section 只有一个 canManage 同时管
           * 新增与解除，closed 行的解除靠服务端 409 兜底）。
           */
          issuesSection={
            <RequirementIssuesSection
              workspaceSlug={slug}
              projectId={project}
              requirementId={peekRow.id}
              requirement={peekRow}
              canManage={canManage && !isRequirementClosed(peekRow)}
              onChanged={() => void refreshRequirementRow(peekRow.id)}
            />
          }
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
        links={productLinks}
        isSubmitting={isProductLinksMutating}
        handleClose={() => setIsProductsModalOpen(false)}
        onSubmit={async (payload) => {
          await updateProducts(payload);
          await store.fetchRequirements();
        }}
      />
    </>
  );
});
