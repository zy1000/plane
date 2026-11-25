import { Fragment, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { Pagination } from "antd";
import { AlertCircle, ChevronDown, ChevronRight, Layers } from "lucide-react";
import {
  PERMISSION_KEYS,
  PRODUCT_SETTINGS_DELETE_PERMISSION_KEY,
  PRODUCT_SETTINGS_EDIT_PERMISSION_KEY,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProductSet, TProductSetListMember } from "@plane/types";
import { AlertModalCore, Avatar, ContentWrapper, ERowVariant, Loader } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { useProductSetMemberActions } from "@/hooks/store/use-product-set-members";
import type { TProductSetRequestError } from "@/hooks/store/use-product-sets";
import { useUserPermissions } from "@/hooks/store/user";
import { useProductsContext } from "../context";
import { hasProductPermission } from "../permissions";
import { AddProductsModal } from "./add-products-modal";
import { ProductSetModal } from "./product-set-modal";
import { ProductKindIcon, ProductSetTreeGuide } from "./product-set-tree";

const I18N = "workspace_product_sets";
const TEXT_BUTTON = "text-13 font-medium text-accent-primary hover:underline";
const TH = "px-4 py-3 text-left font-medium text-secondary";
/** 子行竖线的横坐标：产品集图标的中心（td 左内边距 16 + 箭头 22 + 间距 8 + 图标 24 的一半） */
const GUIDE_LEFT = 58;

const OwnerCell = ({ owner }: { owner: TProductSet["owner_detail"] | null | undefined }) => (
  <div className="flex min-w-0 items-center gap-2">
    <Avatar size="sm" name={owner?.display_name} src={getFileURL(owner?.avatar_url ?? "")} showTooltip={false} />
    <span className="truncate text-13 text-primary">{owner?.display_name ?? "-"}</span>
  </div>
);

/** 产品管理页的「产品集」页签：列表 + 创建 / 编辑 / 删除。搜索词与产品页签共用页头的搜索框。 */
export const ProductSetsRoot = observer(function ProductSetsRoot() {
  const { t } = useTranslation();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const { workspaceSlug, sets, searchQuery, openProductSetModal, products, fetchProducts } = useProductsContext();
  const { productSets, isLoading, hasError, fetchProductSets, deleteProductSet } = sets;
  const canCreate = allowWorkspacePermissionKeys([PERMISSION_KEYS.WORKSPACE_PRODUCT_CREATE], workspaceSlug);
  const memberActions = useProductSetMemberActions(workspaceSlug || undefined);

  // ProductsProvider 在列表与详情间一直挂着，需求 / 用例 / 缺陷数在详情里变了它不知道：每次进列表重拉一次
  useEffect(() => {
    void fetchProductSets().catch(() => undefined);
  }, [fetchProductSets]);

  // 搜索：产品集名 / 编号命中留整组；否则只留命中的集内产品（及其产品集）
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredSets = useMemo(() => {
    const hit = (texts: string[]) => texts.some((text) => text.toLocaleLowerCase().includes(normalizedSearch));
    if (!normalizedSearch) return productSets;
    return productSets.flatMap((productSet) => {
      if (hit([productSet.name, productSet.identifier, productSet.code ?? ""])) return [productSet];
      const members = productSet.products.filter((member) => hit([member.name, member.identifier, member.code ?? ""]));
      return members.length > 0 ? [{ ...productSet, products: members }] : [];
    });
  }, [normalizedSearch, productSets]);
  const memberTotal = filteredSets.reduce((sum, productSet) => sum + productSet.products.length, 0);

  // 默认全部展开，记住收起的那些
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const toggleCollapsed = (id: string) =>
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** 加入 / 移出后：产品上的「所属产品集」和产品集列表的汇总都变了，各重拉一次 */
  const refreshRelated = () => {
    void fetchProducts().catch(() => undefined);
    void fetchProductSets().catch(() => undefined);
  };

  const [addTarget, setAddTarget] = useState<TProductSet | null>(null);
  const candidates = useMemo(() => products.filter((product) => !product.is_set), [products]);
  const handleAdd = (productIds: string[]) => {
    if (!addTarget) return;
    void (async () => {
      try {
        await memberActions.addMembers(addTarget.id, productIds);
        setAddTarget(null);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t(`${I18N}.members.toast_added`) });
      } catch (requestError) {
        const code = (requestError as TProductSetRequestError | undefined)?.code;
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: t(
            code === "PRODUCT_ALREADY_IN_SET"
              ? `${I18N}.errors.product_already_in_set`
              : code === "PRODUCT_CODE_MISMATCH"
                ? `${I18N}.errors.product_code_mismatch`
                : `${I18N}.toast.failed`
          ),
        });
      } finally {
        refreshRelated();
      }
    })();
  };

  const [pendingRemove, setPendingRemove] = useState<{ setId: string; member: TProductSetListMember } | null>(null);
  const handleRemove = () => {
    if (!pendingRemove) return;
    void (async () => {
      try {
        await memberActions.removeMember(pendingRemove.setId, pendingRemove.member.id);
        setPendingRemove(null);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t(`${I18N}.members.toast_removed`) });
        refreshRelated();
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t(`${I18N}.toast.failed`) });
      }
    })();
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredSets.length]);
  const pageRows = filteredSets.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const [setToDelete, setSetToDelete] = useState<TProductSet | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDelete = async () => {
    if (!setToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProductSet(setToDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t(`${I18N}.toast.deleted`) });
      setSetToDelete(null);
    } catch (requestError) {
      const code = (requestError as TProductSetRequestError | undefined)?.code;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t(code === "PRODUCT_SET_HAS_PRODUCTS" ? `${I18N}.errors.product_set_has_products` : `${I18N}.toast.failed`),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const centered = (children: React.ReactNode) => (
    <div className="flex h-full min-h-80 items-center justify-center p-6">
      <div className="max-w-md text-center">{children}</div>
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col">
      <PageHead title={t(`${I18N}.title`)} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <ContentWrapper variant={ERowVariant.HUGGING} className="overflow-hidden">
            <div className="space-y-3 rounded border border-subtle bg-surface-1 p-4">
              {Array.from({ length: 6 }).map((_, row) => (
                <Loader.Item key={row} height="40px" width="100%" />
              ))}
            </div>
          </ContentWrapper>
        ) : hasError ? (
          centered(
            <>
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
                <AlertCircle className="size-5" />
              </span>
              <h2 className="mt-3 text-14 font-medium text-primary">{t(`${I18N}.error_title`)}</h2>
              <Button className="mt-4" variant="secondary" onClick={() => void fetchProductSets().catch(() => undefined)}>
                {t("retry")}
              </Button>
            </>
          )
        ) : filteredSets.length === 0 ? (
          centered(
            <>
              <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                <Layers className="size-5" />
              </span>
              <h2 className="mt-3 text-14 font-medium text-primary">
                {t(normalizedSearch ? `${I18N}.empty.search_title` : `${I18N}.empty.title`)}
              </h2>
              {!normalizedSearch && canCreate && (
                <Button className="mt-4" variant="primary" onClick={() => openProductSetModal()}>
                  {t(`${I18N}.create`)}
                </Button>
              )}
            </>
          )
        ) : (
          <ContentWrapper variant={ERowVariant.HUGGING} className="overflow-hidden">
            <div className="m-0 flex h-full w-full flex-col overflow-hidden rounded border border-subtle bg-surface-1">
              <div className="vertical-scrollbar scrollbar-lg min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[1264px] table-fixed text-sm">
                  <thead className="border-b border-subtle bg-layer-1">
                    <tr>
                      <th className={TH}>{t(`${I18N}.fields.name`)}</th>
                      <th className={`${TH} w-36`}>{t(`${I18N}.fields.code`)}</th>
                      <th className={`${TH} w-32`}>{t(`${I18N}.fields.identifier`)}</th>
                      <th className={`${TH} w-20 !text-right`}>{t(`${I18N}.fields.requirements`)}</th>
                      <th className={`${TH} w-20 !text-right`}>{t(`${I18N}.fields.cases`)}</th>
                      <th className={`${TH} w-28 !text-right`}>{t(`${I18N}.fields.open_defects`)}</th>
                      <th className={`${TH} w-36`}>{t(`${I18N}.fields.owner`)}</th>
                      <th className={`${TH} w-32`}>{t(`${I18N}.fields.updated_at`)}</th>
                      <th className={`${TH} w-44`}>{t(`${I18N}.fields.actions`)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((productSet) => {
                      const editable = hasProductPermission(productSet, PRODUCT_SETTINGS_EDIT_PERMISSION_KEY);
                      const deletable = hasProductPermission(productSet, PRODUCT_SETTINGS_DELETE_PERMISSION_KEY);
                      // 搜索时强制展开，命中的集内产品才看得到
                      const isExpanded = Boolean(normalizedSearch) || !collapsedIds.has(productSet.id);
                      const members = productSet.products;
                      return (
                        <Fragment key={productSet.id}>
                          <tr
                            // 展开时与子行读作一组，不画分隔线（透明边框仍占 1px，会在带底色的子行间露白缝）
                            className={cn("hover:bg-layer-1-hover", !isExpanded && "border-b border-subtle")}
                          >
                            <td className="px-4 py-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleCollapsed(productSet.id)}
                                  aria-expanded={isExpanded}
                                  aria-label={t(
                                    isExpanded ? "project_requirements.tree.collapse" : "project_requirements.tree.expand"
                                  )}
                                  className="grid size-[22px] shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
                                >
                                  {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                                </button>
                                <ProductKindIcon isSet />
                                <Link
                                  to={`/${workspaceSlug}/products/${productSet.id}/overview`}
                                  className="truncate text-sm font-medium text-primary hover:underline"
                                >
                                  {productSet.name}
                                </Link>
                                <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-label-indigo-bg px-2 text-12 font-medium text-label-indigo-text">
                                  {t(`${I18N}.product_count`, { count: members.length })}
                                </span>
                              </div>
                            </td>
                            <td className="truncate px-4 py-3 text-13 text-secondary" title={productSet.code}>
                              {productSet.code || "-"}
                            </td>
                            <td className="px-4 py-3 text-13 text-secondary tabular-nums">{productSet.identifier}</td>
                            <td className="px-4 py-3 text-right text-13 text-primary tabular-nums">
                              {productSet.requirement_count}
                            </td>
                            <td className="px-4 py-3 text-right text-13 text-primary tabular-nums">
                              {productSet.case_count}
                            </td>
                            <td className="px-4 py-3 text-right text-13 text-primary tabular-nums">
                              {productSet.open_defect_count}
                            </td>
                            <td className="px-4 py-3">
                              <OwnerCell owner={productSet.owner_detail} />
                            </td>
                            <td className="px-4 py-3 text-13 whitespace-nowrap text-secondary">
                              {productSet.updated_at ? renderFormattedDate(productSet.updated_at) : "-"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-4">
                                {editable && (
                                  <button type="button" className={TEXT_BUTTON} onClick={() => setAddTarget(productSet)}>
                                    {t(`${I18N}.members.add_title`)}
                                  </button>
                                )}
                                {editable && (
                                  <button type="button" className={TEXT_BUTTON} onClick={() => openProductSetModal(productSet)}>
                                    {t(`${I18N}.actions.edit`)}
                                  </button>
                                )}
                                {deletable && (
                                  <button
                                    type="button"
                                    className="text-13 font-medium text-danger-primary hover:underline"
                                    onClick={() => setSetToDelete(productSet)}
                                  >
                                    {t(`${I18N}.actions.delete`)}
                                  </button>
                                )}
                                {!editable && !deletable && <span className="text-tertiary">-</span>}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && members.length === 0 && (
                            <tr className="border-b border-subtle bg-layer-1/40">
                              <td colSpan={9} className="relative py-2.5 pr-4 pl-[75px] text-13 text-tertiary">
                                <ProductSetTreeGuide left={GUIDE_LEFT} isLast />
                                {t(`${I18N}.members.empty_title`)}
                              </td>
                            </tr>
                          )}
                          {isExpanded &&
                            members.map((member, index) => {
                              const isLast = index === members.length - 1;
                              return (
                                <tr
                                  key={member.id}
                                  className={cn("bg-layer-1/40 hover:bg-layer-1-hover", isLast && "border-b border-subtle")}
                                >
                                  <td className="relative py-2.5 pr-4 pl-[75px]">
                                    <ProductSetTreeGuide left={GUIDE_LEFT} isLast={isLast} />
                                    <div className="flex min-w-0 items-center gap-2">
                                      <ProductKindIcon isSet={false} />
                                      <Link
                                        to={`/${workspaceSlug}/products/${member.id}/overview`}
                                        className="truncate text-13 text-primary hover:underline"
                                      >
                                        {member.name}
                                      </Link>
                                    </div>
                                  </td>
                                  <td className="truncate px-4 py-2.5 text-13 text-secondary" title={member.code}>
                                    {member.code || "-"}
                                  </td>
                                  <td className="px-4 py-2.5 text-13 text-secondary tabular-nums">{member.identifier}</td>
                                  <td className="px-4 py-2.5 text-right text-13 text-primary tabular-nums">
                                    {member.requirement_count}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-13 text-primary tabular-nums">
                                    {member.case_count}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-13 text-primary tabular-nums">
                                    {member.open_defect_count}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <OwnerCell owner={member.owner_detail} />
                                  </td>
                                  <td className="px-4 py-2.5 text-13 whitespace-nowrap text-secondary">
                                    {member.updated_at ? renderFormattedDate(member.updated_at) : "-"}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {editable ? (
                                      <button
                                        type="button"
                                        className="text-13 text-secondary hover:text-primary hover:underline"
                                        onClick={() => setPendingRemove({ setId: productSet.id, member })}
                                      >
                                        {t(`${I18N}.members.remove`)}
                                      </button>
                                    ) : (
                                      <span className="text-tertiary">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
                <span className="text-sm text-secondary">
                  {t(`${I18N}.total_with_products`, { sets: filteredSets.length, products: memberTotal })}
                </span>
                <Pagination
                  simple
                  current={currentPage}
                  pageSize={pageSize}
                  total={filteredSets.length}
                  showSizeChanger
                  pageSizeOptions={["10", "20", "50", "100"]}
                  onChange={(page, size) => {
                    setCurrentPage(page);
                    setPageSize(size);
                  }}
                  size="small"
                />
              </div>
            </div>
          </ContentWrapper>
        )}
      </div>
      <ProductSetModal />
      <AddProductsModal
        isOpen={Boolean(addTarget)}
        productSetId={addTarget?.id ?? ""}
        productSetCode={addTarget?.code ?? ""}
        products={candidates}
        isSubmitting={memberActions.isMutating}
        handleClose={() => setAddTarget(null)}
        onSubmit={handleAdd}
      />
      <AlertModalCore
        isOpen={Boolean(pendingRemove)}
        handleClose={() => !memberActions.isMutating && setPendingRemove(null)}
        handleSubmit={handleRemove}
        isSubmitting={memberActions.isMutating}
        title={t(`${I18N}.members.remove_title`)}
        content={t(`${I18N}.members.remove_description`, { name: pendingRemove?.member.name ?? "" })}
        primaryButtonText={{ default: t(`${I18N}.members.remove`), loading: t(`${I18N}.members.removing`) }}
        secondaryButtonText={t("cancel")}
      />
      <AlertModalCore
        isOpen={Boolean(setToDelete)}
        handleClose={() => !isDeleting && setSetToDelete(null)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        title={t(`${I18N}.delete.title`)}
        content={t(`${I18N}.delete.description`, { name: setToDelete?.name ?? "" })}
        primaryButtonText={{ default: t(`${I18N}.actions.delete`), loading: t(`${I18N}.delete.deleting`) }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
});
