import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useOutletContext } from "react-router";
import { ChevronLeft, Database, Package } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { PageHead } from "@/components/core/page-title";
import { StructuredRequirementEditor } from "@/components/product/requirements/structured-requirement-editor";
import { useRequirementReview } from "@/hooks/store/use-requirement-review";
import { useUserRequirements } from "@/hooks/store/use-user-requirements";
import { useAppRouter } from "@/hooks/use-app-router";
import type { TProductDetailOutletContext } from "@/components/product/product-detail-layout";

export default function DevelopmentRequirementDataPage() {
  const { productId, requirementId, workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const id = productId?.toString();
  const reqId = requirementId?.toString();
  const router = useAppRouter();
  const { product } = useOutletContext<TProductDetailOutletContext>();
  const { fetchDetail, isLoading, requirement } = useRequirementReview(slug, id, "development");
  const { submitChange } = useUserRequirements(slug, id, "development");

  useEffect(() => {
    if (reqId) void fetchDetail(reqId).catch(() => undefined);
  }, [fetchDetail, reqId]);

  if (!slug || !id || !reqId) return null;
  const revisionId = requirement?.open_change?.structured_revision_id ?? requirement?.active_structured_revision;
  const editable = Boolean(
    requirement?.content_mode === "structured" &&
    requirement.open_change?.status === "draft" &&
    requirement.permissions.can_edit_draft
  );

  return (
    <>
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
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink label="研发需求" href={`/${slug}/products/${id}/development-requirements`} />
                  }
                />
                {requirement && <Breadcrumbs.Item component={<BreadcrumbLink label={requirement.name} />} />}
                <Breadcrumbs.Item
                  component={<BreadcrumbLink label="结构化数据" icon={<Database className="size-4" />} />}
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem>
              <Button
                variant="secondary"
                size="lg"
                prependIcon={<ChevronLeft className="size-4" />}
                onClick={() => router.push(`/${slug}/products/${id}/development-requirements/${reqId}`)}
              >
                返回详情
              </Button>
            </Header.RightItem>
          </Header>
        }
      />
      <PageHead title={requirement ? `${requirement.name} - 结构化数据` : "结构化数据"} />
      <div className="h-full min-h-0 overflow-hidden bg-surface-1">
        {isLoading ? (
          <div className="h-full animate-pulse bg-layer-1" />
        ) : requirement?.content_mode !== "structured" || !revisionId ? (
          <div className="grid h-full place-items-center text-12 text-secondary">当前需求没有可用的结构化修订。</div>
        ) : (
          <StructuredRequirementEditor
            workspaceSlug={slug}
            productId={id}
            requirementId={reqId}
            revisionId={revisionId}
            editable={editable}
            onSubmit={
              editable && requirement.open_change
                ? async () => {
                    await submitChange(reqId, requirement.open_change?.id ?? "");
                    await fetchDetail(reqId);
                  }
                : undefined
            }
          />
        )}
      </div>
    </>
  );
}
