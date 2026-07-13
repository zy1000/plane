import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useOutletContext } from "react-router";
import { Check, ChevronLeft, CircleHelp, Package, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Breadcrumbs, Header } from "@plane/ui";
import { cn } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useRequirementReview } from "@/hooks/store/use-requirement-review";
import { useAppRouter } from "@/hooks/use-app-router";
import type { TRequirementReviewOpinion, TRequirementType } from "@/services/requirement.service";
import type { TProductDetailOutletContext } from "../product-detail-layout";
import {
  RequirementAttachments,
  RequirementDiffPanel,
  RequirementReviewHistory,
  RequirementStatusBadge,
} from "./requirement-review-panels";

const opinions: {
  value: TRequirementReviewOpinion;
  label: string;
  description: string;
  icon: typeof Check;
  selectedClassName: string;
}[] = [
  {
    value: "approved",
    label: "通过",
    description: "确认内容明确且可以进入激活状态",
    icon: Check,
    selectedClassName: "border-green-500 bg-green-500/5 text-green-700 dark:text-green-300",
  },
  {
    value: "needs_clarification",
    label: "有待明确",
    description: "保留本轮评审，等待发起人补充说明",
    icon: CircleHelp,
    selectedClassName: "border-yellow-500 bg-yellow-500/5 text-yellow-700 dark:text-yellow-300",
  },
  {
    value: "rejected",
    label: "拒绝",
    description: "结束本轮评审并将需求标记为拒绝",
    icon: X,
    selectedClassName: "border-red-500 bg-red-500/5 text-red-700 dark:text-red-300",
  },
];

export const RequirementReviewRoot = observer(function RequirementReviewRoot(props: {
  requirementType: TRequirementType;
}) {
  const { requirementType } = props;
  const { changeId, productId, requirementId, workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const id = productId?.toString();
  const reqId = requirementId?.toString();
  const router = useAppRouter();
  const { product } = useOutletContext<TProductDetailOutletContext>();
  const {
    change: refreshedChange,
    fetchChange,
    fetchDetail,
    isLoading,
    isMutating,
    requirement,
    submitReview,
  } = useRequirementReview(slug, id, requirementType);
  const [opinion, setOpinion] = useState<TRequirementReviewOpinion>("approved");
  const [reason, setReason] = useState("");
  const change = refreshedChange ?? requirement?.latest_change;
  const label = requirementType === "user" ? "用户需求" : "研发需求";
  const path = requirementType === "user" ? "user-requirements" : "development-requirements";

  useEffect(() => {
    if (reqId) void fetchDetail(reqId).catch(() => undefined);
  }, [fetchDetail, reqId]);

  useEffect(() => {
    if (reqId && changeId) void fetchChange(reqId, changeId.toString()).catch(() => undefined);
  }, [changeId, fetchChange, reqId]);

  if (!slug || !id || !reqId) return null;

  const handleSubmit = async () => {
    if (!change) return;
    if (opinion === "rejected" && !reason.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "请填写评审原因", message: "拒绝需求时原因不能为空。" });
      return;
    }
    try {
      await submitReview(reqId, change.id, opinion, reason);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "评审已提交", message: "你的评审意见已经记录。" });
      setReason("");
      await fetchDetail(reqId);
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "提交失败", message: error?.error ?? "请稍后重试。" });
    }
  };

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
                <Breadcrumbs.Item component={<BreadcrumbLink label="需求评审" />} />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem>
              <Button
                variant="secondary"
                size="lg"
                prependIcon={<ChevronLeft className="size-4" />}
                onClick={() => router.push(`/${slug}/products/${id}/${path}/${reqId}`)}
              >
                返回详情
              </Button>
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="overflow-y-auto bg-layer-1 px-4 py-6 md:px-8">
        <PageHead title={requirement ? `${requirement.name} - 需求评审` : "需求评审"} />
        {isLoading ? (
          <div className="mx-auto max-w-6xl animate-pulse space-y-4">
            <div className="h-28 rounded-xl bg-surface-1" />
            <div className="h-72 rounded-xl bg-surface-1" />
          </div>
        ) : !requirement || !change ? (
          <div className="grid h-full place-items-center text-13 text-secondary">暂无可展示的评审记录。</div>
        ) : (
          <div className="mx-auto max-w-6xl pb-12">
            <section className="mb-5 rounded-xl border border-subtle bg-surface-1 p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <RequirementStatusBadge status={requirement.status} />
                    <span className="rounded-full bg-layer-1 px-2.5 py-1 text-11 text-secondary">
                      第 {change.sequence} 轮评审
                    </span>
                    <span className="rounded-full bg-layer-1 px-2.5 py-1 text-11 text-secondary">
                      当前 V{requirement.current_version}
                    </span>
                  </div>
                  <h1 className="text-22 mt-3 font-semibold tracking-tight break-words text-primary">{change.name}</h1>
                  <p className="mt-1 text-12 text-secondary">所有评审人通过后才会应用本次变更并生成新版本。</p>
                </div>
                <div className="min-w-56 rounded-lg border border-subtle bg-layer-1 p-3">
                  <div className="flex justify-between text-11 text-secondary">
                    <span>通过进度</span>
                    <span>
                      {change.review_progress.approved}/{change.review_progress.total}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-layer-2">
                    <div
                      className="bg-green-500 h-full rounded-full transition-all"
                      style={{
                        width: `${
                          change.review_progress.total
                            ? (change.review_progress.approved / change.review_progress.total) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <RequirementDiffPanel change={change} />
              <aside className="space-y-4 lg:sticky lg:top-4">
                {change.can_review && change.status === "pending" && (
                  <section className="rounded-xl border border-accent-subtle bg-surface-1 p-4 shadow-sm">
                    <h2 className="text-14 font-semibold text-primary">提交我的意见</h2>
                    <div className="mt-3 space-y-2">
                      {opinions.map((item) => {
                        const Icon = item.icon;
                        const selected = opinion === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => setOpinion(item.value)}
                            className={cn(
                              "flex w-full gap-3 rounded-lg border border-subtle p-3 text-left transition-colors hover:bg-layer-1",
                              selected && item.selectedClassName
                            )}
                          >
                            <Icon className="mt-0.5 size-4 shrink-0" />
                            <span>
                              <span className="block text-12 font-semibold">{item.label}</span>
                              <span className="mt-0.5 block text-10 leading-4 opacity-80">{item.description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <label htmlFor="review-reason" className="mt-4 block text-12 font-medium text-primary">
                      评审原因 {opinion === "rejected" ? <span className="text-danger-primary">*</span> : "（可选）"}
                    </label>
                    <textarea
                      id="review-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={4}
                      placeholder="说明判断依据，帮助其他参与者理解你的意见"
                      className="focus:border-accent-primary mt-1.5 w-full resize-y rounded-md border border-subtle bg-surface-1 px-3 py-2 text-12 text-primary outline-none"
                    />
                    <Button
                      variant="primary"
                      size="lg"
                      className="mt-3 w-full justify-center"
                      loading={isMutating}
                      onClick={() => void handleSubmit()}
                    >
                      提交评审
                    </Button>
                  </section>
                )}
                {!change.can_review && change.status === "pending" && (
                  <div className="rounded-lg border border-subtle bg-layer-1 px-4 py-3 text-11 leading-5 text-secondary">
                    你不是本轮待处理评审人，或你已经提交最终意见。
                  </div>
                )}
                <RequirementReviewHistory change={change} />
                <RequirementAttachments change={change} />
              </aside>
            </div>
          </div>
        )}
      </ContentWrapper>
    </>
  );
});
