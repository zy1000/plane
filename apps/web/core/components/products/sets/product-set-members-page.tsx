import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { PackageOpen } from "lucide-react";
import { Link, useParams } from "react-router";
import { PRODUCT_SETTINGS_EDIT_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProductSetMember } from "@plane/types";
import { AlertModalCore, Breadcrumbs, Header, Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";
import { useProductSetMembers } from "@/hooks/store/use-product-set-members";
import type { TProductSetRequestError } from "@/hooks/store/use-product-sets";
import { useProductsContext } from "../context";
import { hasProductPermission } from "../permissions";
import { AddProductsModal } from "./add-products-modal";

const I18N = "workspace_product_sets.members";
const TH = "px-4 py-2.5";

/** 产品集「产品」页签：集内产品的列表、添加、移出。 */
export const ProductSetMembersPage = observer(function ProductSetMembersPage() {
  const { t } = useTranslation();
  const { workspaceSlug, productId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { products, sets, fetchProducts } = useProductsContext();
  const productSet = products.find((item) => item.id === productId);
  const canManage = hasProductPermission(productSet, PRODUCT_SETTINGS_EDIT_PERMISSION_KEY);
  const { members, isLoading, hasError, isMutating, fetchMembers, addMembers, removeMember } = useProductSetMembers(
    slug || undefined,
    productId?.toString()
  );
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<TProductSetMember | null>(null);
  const featureTitle = t("workspace_product_sets.navigation.products");
  const candidates = useMemo(() => products.filter((product) => !product.is_set), [products]);

  /** 加入 / 移出后：产品上的「所属产品集」和产品集列表的汇总都变了，各重拉一次 */
  const refreshRelated = () => {
    void fetchProducts().catch(() => undefined);
    void sets.fetchProductSets().catch(() => undefined);
  };

  const handleAdd = (productIds: string[]) => {
    void (async () => {
      try {
        await addMembers(productIds);
        setIsAddOpen(false);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t(`${I18N}.toast_added`) });
      } catch (requestError) {
        const code = (requestError as TProductSetRequestError | undefined)?.code;
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: t(
            code === "PRODUCT_ALREADY_IN_SET"
              ? "workspace_product_sets.errors.product_already_in_set"
              : code === "PRODUCT_CODE_MISMATCH"
                ? "workspace_product_sets.errors.product_code_mismatch"
                : "workspace_product_sets.toast.failed"
          ),
        });
      } finally {
        refreshRelated();
      }
    })();
  };

  const handleRemoveConfirm = () => {
    if (!pendingRemove) return;
    void (async () => {
      try {
        await removeMember(pendingRemove.id);
        setPendingRemove(null);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t(`${I18N}.toast_removed`) });
        refreshRelated();
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("workspace_product_sets.toast.failed") });
      }
    })();
  };

  return (
    <>
      <PageHead title={productSet ? `${featureTitle} - ${productSet.name}` : featureTitle} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink label={featureTitle} icon={<PackageOpen className="size-4 text-tertiary" />} isLast />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            {canManage && (
              <Header.RightItem>
                <Button variant="primary" size="lg" onClick={() => setIsAddOpen(true)}>
                  {t(`${I18N}.add_title`)}
                </Button>
              </Header.RightItem>
            )}
          </Header>
        }
      />
      <ContentWrapper>
        <div className="h-full overflow-auto bg-surface-1">
          {isLoading ? (
            <div className="p-4">
              <Loader className="space-y-2">
                {Array.from({ length: 5 }, (_, index) => (
                  <Loader.Item key={index} height="44px" />
                ))}
              </Loader>
            </div>
          ) : hasError ? (
            <div className="grid h-full min-h-80 place-items-center px-6 py-16 text-center">
              <div>
                <p className="text-13 font-medium text-primary">{t(`${I18N}.error_title`)}</p>
                <Button className="mt-3" variant="secondary" onClick={() => void fetchMembers()}>
                  {t("retry")}
                </Button>
              </div>
            </div>
          ) : members.length === 0 ? (
            <div className="grid h-full min-h-80 place-items-center px-6 py-10 text-center">
              <div>
                <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                  <PackageOpen className="size-5" />
                </span>
                <h1 className="mt-3 text-14 font-medium text-primary">{t(`${I18N}.empty_title`)}</h1>
                {canManage && (
                  <Button variant="primary" size="lg" className="mt-4" onClick={() => setIsAddOpen(true)}>
                    {t(`${I18N}.add_title`)}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-[1] bg-layer-1">
                <tr className="border-b border-subtle text-12 font-medium text-secondary">
                  <th className="px-5 py-2.5">{t(`${I18N}.product`)}</th>
                  <th className={`${TH} w-40`}>{t(`${I18N}.identifier`)}</th>
                  <th className={`${TH} w-56`}>{t(`${I18N}.code`)}</th>
                  <th className={`${TH} w-36`}>{t(`${I18N}.status`)}</th>
                  <th className={`${TH} w-24 text-right`}>{t(`${I18N}.referenced_requirements`)}</th>
                  <th className={`${TH} w-24 text-right`}>{t(`${I18N}.converted_requirements`)}</th>
                  <th className={`${TH} w-40`}>{t(`${I18N}.joined_at`)}</th>
                  {canManage && <th className={`${TH} w-24`}>{t("workspace_product_sets.fields.actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-subtle text-13 text-primary hover:bg-layer-1-hover">
                    <td className="px-5 py-3">
                      <Link
                        to={`/${slug}/products/${member.id}/overview`}
                        className="block truncate font-medium hover:underline"
                      >
                        {member.name}
                      </Link>
                    </td>
                    <td className={`${TH} tabular-nums`}>{member.identifier}</td>
                    <td className={TH}>
                      <span className="block truncate text-secondary">{member.code || "-"}</span>
                    </td>
                    <td className={TH}>
                      {member.status_detail ? (
                        <DictionaryValueTag
                          label={member.status_detail.label}
                          color={resolveDictionaryItemColor(member.status_detail)}
                        />
                      ) : (
                        <span className="text-tertiary">-</span>
                      )}
                    </td>
                    <td className={`${TH} text-right tabular-nums`}>{member.referenced_requirement_count}</td>
                    <td className={`${TH} text-right tabular-nums`}>{member.converted_requirement_count}</td>
                    <td className={`${TH} whitespace-nowrap text-secondary`}>
                      {member.joined_at ? renderFormattedDate(member.joined_at) : "-"}
                    </td>
                    {canManage && (
                      <td className={TH}>
                        <button
                          type="button"
                          className="text-13 font-medium text-accent-primary hover:underline"
                          onClick={() => setPendingRemove(member)}
                        >
                          {t(`${I18N}.remove`)}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </ContentWrapper>
      <AddProductsModal
        isOpen={isAddOpen}
        productSetId={productId?.toString() ?? ""}
        productSetCode={productSet?.code ?? ""}
        products={candidates}
        isSubmitting={isMutating}
        handleClose={() => setIsAddOpen(false)}
        onSubmit={handleAdd}
      />
      <AlertModalCore
        isOpen={Boolean(pendingRemove)}
        handleClose={() => !isMutating && setPendingRemove(null)}
        handleSubmit={handleRemoveConfirm}
        isSubmitting={isMutating}
        title={t(`${I18N}.remove_title`)}
        content={t(`${I18N}.remove_description`, { name: pendingRemove?.name ?? "" })}
        primaryButtonText={{ default: t(`${I18N}.remove`), loading: t(`${I18N}.removing`) }}
        secondaryButtonText={t("cancel")}
      />
    </>
  );
});
