import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useOutletContext } from "react-router";
import { CheckCircle2, ClipboardCheck, Package, TimerReset } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header } from "@plane/ui";
import { calculateTimeAgo, cn } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useRequirementReview } from "@/hooks/store/use-requirement-review";
import { useAppRouter } from "@/hooks/use-app-router";
import type { TRequirementType } from "@/services/requirement.service";
import type { TProductDetailOutletContext } from "../product-detail-layout";
import { RequirementStatusBadge } from "./requirement-review-panels";

export const RequirementReviewQueueRoot = observer(function RequirementReviewQueueRoot(props: {
  requirementType: TRequirementType;
}) {
  const { requirementType } = props;
  const { productId, workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const id = productId?.toString();
  const router = useAppRouter();
  const { product } = useOutletContext<TProductDetailOutletContext>();
  const { fetchMyReviews, isLoading, pendingCount, reviewItems } = useRequirementReview(slug, id, requirementType);
  const [tab, setTab] = useState<"pending" | "processed">("pending");
  const label = requirementType === "user" ? "用户需求" : "研发需求";
  const path = requirementType === "user" ? "user-requirements" : "development-requirements";

  useEffect(() => {
    void fetchMyReviews(tab).catch(() => undefined);
  }, [fetchMyReviews, tab]);

  if (!slug || !id) return null;

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
                  component={<BreadcrumbLink label={label} href={`/${slug}/products/${id}/${path}`} />}
                />
                <Breadcrumbs.Item component={<BreadcrumbLink label="我的评审" />} />
              </Breadcrumbs>
            </Header.LeftItem>
          </Header>
        }
      />
      <ContentWrapper className="overflow-y-auto bg-layer-1 px-4 py-6 md:px-8">
        <PageHead title={`我的${label}评审`} />
        <div className="mx-auto max-w-5xl pb-12">
          <section className="rounded-xl border border-subtle bg-surface-1 p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-lg bg-accent-primary/10 text-accent-primary">
                    <ClipboardCheck className="size-4" />
                  </span>
                  <div>
                    <h1 className="text-18 font-semibold text-primary">我的评审</h1>
                    <p className="text-11 text-secondary">集中处理分配给你的{label}评审任务。</p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-subtle bg-layer-1 px-4 py-2 text-center">
                <p className="text-20 font-semibold text-primary">{pendingCount}</p>
                <p className="text-10 text-secondary">待处理</p>
              </div>
            </div>
            <div className="mt-5 flex gap-1 border-b border-subtle">
              {(
                [
                  ["pending", "待我评审", TimerReset],
                  ["processed", "已处理", CheckCircle2],
                ] as const
              ).map(([value, text, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-4 py-2.5 text-12 font-medium text-secondary",
                    tab === value &&
                      "text-primary after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:bg-accent-primary"
                  )}
                >
                  <Icon className="size-3.5" /> {text}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className="h-24 animate-pulse rounded-lg bg-layer-1" />
                  ))}
                </div>
              ) : reviewItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-subtle px-5 py-16 text-center">
                  <ClipboardCheck className="mx-auto size-7 text-placeholder" />
                  <p className="mt-3 text-13 font-medium text-primary">
                    {tab === "pending" ? "没有待处理评审" : "还没有已处理记录"}
                  </p>
                  <p className="mt-1 text-11 text-secondary">
                    {tab === "pending" ? "新的评审任务会出现在这里。" : "完成评审后可在这里回看意见。"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reviewItems.map((change) => (
                    <button
                      key={change.id}
                      type="button"
                      className="group flex w-full flex-col gap-3 rounded-lg border border-subtle bg-surface-1 p-4 text-left transition-all hover:border-accent-subtle hover:bg-layer-1/40 sm:flex-row sm:items-center sm:justify-between"
                      onClick={() =>
                        router.push(`/${slug}/products/${id}/${path}/${change.requirement}/review/${change.id}`)
                      }
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <RequirementStatusBadge status={change.requirement_status} />
                          <span className="text-10 text-tertiary">第 {change.sequence} 轮</span>
                          <span className="text-10 text-tertiary">{calculateTimeAgo(change.created_at)}</span>
                        </div>
                        <p className="mt-2 truncate text-14 font-semibold text-primary group-hover:text-accent-primary">
                          {change.name}
                        </p>
                        <p className="mt-1 text-11 text-secondary">
                          {change.diff.changed_count} 个字段变更 · {change.review_progress.approved}/
                          {change.review_progress.total} 已通过
                        </p>
                      </div>
                      <Button variant="secondary" size="sm">
                        {change.can_review ? "开始评审" : "查看记录"}
                      </Button>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </ContentWrapper>
    </>
  );
});
