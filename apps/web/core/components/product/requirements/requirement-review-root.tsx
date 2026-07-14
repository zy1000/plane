import { useEffect, useState, type FormEvent } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useOutletContext } from "react-router";
import { ArrowRight, Check, ChevronLeft, CircleHelp, ClipboardCheck, GitCompareArrows, Package, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar, Breadcrumbs, Header, TextArea } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useMember } from "@/hooks/store/use-member";
import { useRequirementReview } from "@/hooks/store/use-requirement-review";
import { useAppRouter } from "@/hooks/use-app-router";
import type {
  TRequirementChangeStatus,
  TRequirementReviewOpinion,
  TRequirementType,
} from "@/services/requirement.service";
import type { TProductDetailOutletContext } from "../product-detail-layout";
import {
  RequirementDiffPanel,
  RequirementReviewHistory,
  RequirementReviewProgress,
  RequirementStatusBadge,
} from "./requirement-review-panels";

const opinions: {
  value: TRequirementReviewOpinion;
  label: string;
  description: string;
  icon: typeof Check;
  selectedClassName: string;
  descriptionClassName: string;
  submitLabel: string;
  reasonLabel: string;
  reasonPlaceholder: string;
}[] = [
  {
    value: "approved",
    label: "通过",
    description: "确认本轮内容完整、明确，并计入通过进度。",
    icon: Check,
    selectedClassName:
      "border-success-strong bg-success-primary/15 text-success-primary shadow-raised-100 hover:bg-success-primary/20",
    descriptionClassName: "bg-green-500/10 text-green-800 dark:text-green-200",
    submitLabel: "确认通过",
    reasonLabel: "补充说明（可选）",
    reasonPlaceholder: "记录通过依据或后续需要关注的内容",
  },
  {
    value: "needs_clarification",
    label: "待明确",
    description: "指出仍需补充的信息，本轮评审将继续保留。",
    icon: CircleHelp,
    selectedClassName:
      "border-warning-strong bg-warning-primary/15 text-warning-primary shadow-raised-100 hover:bg-warning-primary/20",
    descriptionClassName: "bg-yellow-500/[0.12] text-yellow-800 dark:text-yellow-200",
    submitLabel: "提交澄清意见",
    reasonLabel: "需要澄清的内容（建议填写）",
    reasonPlaceholder: "具体说明疑问、缺失信息或需要确认的边界",
  },
  {
    value: "rejected",
    label: "拒绝",
    description: "结束本轮评审，本次变更不会应用到需求。",
    icon: X,
    selectedClassName:
      "border-danger-strong bg-danger-primary/15 text-danger-primary shadow-raised-100 hover:bg-danger-primary/20",
    descriptionClassName: "bg-red-500/10 text-red-800 dark:text-red-200",
    submitLabel: "确认拒绝",
    reasonLabel: "拒绝原因",
    reasonPlaceholder: "说明拒绝依据，帮助发起人理解并调整提案",
  },
];

const reviewStatusDescription: Record<TRequirementChangeStatus, string> = {
  pending: "请对照基线核对本轮提案；所有评审人通过后，变更才会写入需求。",
  approved: "本轮评审已经通过，以下内容作为完整的评审记录保留。",
  rejected: "本轮评审已被拒绝，以下内容作为完整的评审记录保留。",
  superseded: "本轮提案已被后续变更取代，以下内容仅供回溯。",
};

type TReviewDecisionPanelProps = {
  idPrefix: string;
  isMutating: boolean;
  onOpinionChange: (opinion: TRequirementReviewOpinion) => void;
  onReasonChange: (reason: string) => void;
  onSubmit: () => Promise<void>;
  opinion: TRequirementReviewOpinion;
  reason: string;
};

function RequirementReviewDecisionPanel(props: TReviewDecisionPanelProps) {
  const { idPrefix, isMutating, onOpinionChange, onReasonChange, onSubmit, opinion, reason } = props;
  const activeOpinion = opinions.find((item) => item.value === opinion) ?? opinions[0];
  const ActiveIcon = activeOpinion.icon;
  const requiresReason = opinion === "rejected";
  const reasonId = `${idPrefix}-reason`;
  const reasonHintId = `${idPrefix}-reason-hint`;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-2xl border border-accent-strong bg-surface-1 shadow-raised-200"
    >
      <div className="bg-accent-primary px-4 py-4 text-on-color">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/15 text-on-color dark:bg-black/15">
              <ClipboardCheck className="size-4" />
            </span>
            <div>
              <h2 className="text-14 font-semibold text-on-color">做出评审决定</h2>
              <p className="mt-0.5 text-10 leading-4 text-on-color/80">先选择结论，再补充判断依据。</p>
            </div>
          </div>
          <span className="shrink-0 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-10 font-medium text-on-color dark:border-black/20 dark:bg-black/10">
            待你处理
          </span>
        </div>
      </div>

      <fieldset className="p-4">
        <legend className="sr-only">选择评审结论</legend>
        <div className="grid grid-cols-3 gap-2">
          {opinions.map((item) => {
            const Icon = item.icon;
            const selected = opinion === item.value;
            return (
              <label key={item.value} className="min-w-0 cursor-pointer">
                <input
                  type="radio"
                  name={`${idPrefix}-opinion`}
                  value={item.value}
                  checked={selected}
                  onChange={() => onOpinionChange(item.value)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "peer-focus-visible:ring-accent-primary/40 peer-focus-visible:ring-offset-surface-1 relative flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-subtle bg-layer-1 px-2 py-3 text-11 font-medium text-secondary transition-[background-color,border-color,box-shadow,transform] duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 hover:-translate-y-0.5 hover:border-strong hover:bg-layer-2 motion-reduce:transform-none motion-reduce:transition-none",
                    selected && item.selectedClassName
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                  {selected && (
                    <span className="absolute top-2 right-2 size-1.5 rounded-full bg-current" aria-hidden="true" />
                  )}
                </span>
              </label>
            );
          })}
        </div>

        <div
          className={cn(
            "mt-3 flex gap-2.5 rounded-lg px-3 py-2.5 text-11 leading-5",
            activeOpinion.descriptionClassName
          )}
          aria-live="polite"
        >
          <ActiveIcon className="mt-0.5 size-3.5 shrink-0 opacity-80" aria-hidden="true" />
          <p className="text-pretty">{activeOpinion.description}</p>
        </div>

        <label htmlFor={reasonId} className="mt-4 block text-11 font-medium text-primary">
          {activeOpinion.reasonLabel}
          {requiresReason && <span className="ml-1 text-danger-primary">*</span>}
        </label>
        <TextArea
          id={reasonId}
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder={activeOpinion.reasonPlaceholder}
          aria-describedby={requiresReason ? reasonHintId : undefined}
          aria-required={requiresReason}
          className="focus:ring-accent-primary/40 mt-1.5 min-h-24 resize-none bg-layer-1 text-12 leading-5 placeholder:text-placeholder focus:ring-1"
        />
        {requiresReason && !reason.trim() && (
          <p id={reasonHintId} className="mt-1.5 text-10 text-danger-primary">
            填写拒绝原因后即可提交。
          </p>
        )}
      </fieldset>

      <div className="border-t border-subtle bg-layer-2 p-4">
        <Button
          type="submit"
          variant={opinion === "rejected" ? "error-fill" : "primary"}
          size="xl"
          className="w-full"
          prependIcon={<ActiveIcon />}
          loading={isMutating}
          disabled={requiresReason && !reason.trim()}
        >
          {activeOpinion.submitLabel}
        </Button>
      </div>
    </form>
  );
}

function RequirementReviewUnavailableNotice() {
  return (
    <section className="rounded-xl border border-subtle bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-layer-1 text-secondary">
          <ClipboardCheck className="size-4" />
        </span>
        <div>
          <h2 className="text-12 font-semibold text-primary">当前无需提交</h2>
          <p className="mt-1 text-11 leading-5 text-secondary">你不是本轮待处理评审人，或已经提交了最终意见。</p>
        </div>
      </div>
    </section>
  );
}

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
  const { getUserDetails } = useMember();
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
  const initiator = change?.created_by ? getUserDetails(change.created_by) : undefined;
  const initiatorName = change?.created_by ? (initiator?.display_name ?? "未知用户") : "系统";
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

  const showDecision = Boolean(change?.can_review && change.status === "pending");

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
                variant="ghost"
                size="lg"
                prependIcon={<ChevronLeft />}
                onClick={() => router.push(`/${slug}/products/${id}/${path}/${reqId}`)}
              >
                返回详情
              </Button>
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="overflow-y-auto bg-layer-1 px-4 py-5 md:px-8 md:py-7">
        <PageHead title={requirement ? `${requirement.name} - 需求评审` : "需求评审"} />
        {isLoading ? (
          <div className="mx-auto max-w-7xl animate-pulse pb-12">
            <div className="h-52 rounded-2xl bg-accent-primary/15" />
            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="h-96 rounded-xl bg-surface-1" />
              <div className="h-72 rounded-xl bg-surface-1" />
            </div>
          </div>
        ) : !requirement || !change ? (
          <div className="mx-auto grid min-h-[45vh] max-w-7xl place-items-center text-center">
            <div>
              <CircleHelp className="mx-auto size-7 text-placeholder" />
              <p className="mt-3 text-13 font-medium text-primary">暂无评审记录</p>
              <p className="mt-1 text-11 text-secondary">该需求当前没有可展示的评审内容。</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-7xl pb-12">
            <section className="relative overflow-hidden rounded-2xl bg-accent-primary text-on-color shadow-raised-300">
              <GitCompareArrows
                className="pointer-events-none absolute -top-12 -right-10 hidden size-56 -rotate-12 text-on-color/10 md:block"
                strokeWidth={1}
                aria-hidden="true"
              />
              <div className="relative grid xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 px-5 py-6 md:px-8 md:py-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <RequirementStatusBadge
                      status={requirement.status}
                      className="border border-white/20 bg-white/10 text-on-color dark:border-black/20 dark:bg-black/10"
                    />
                    <span className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-11 text-on-color/80 dark:border-black/20 dark:bg-black/10">
                      第 {change.sequence} 轮评审
                    </span>
                    <span className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-11 text-on-color/80 dark:border-black/20 dark:bg-black/10">
                      当前 V{requirement.current_version}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-11 text-on-color/80 dark:border-black/20 dark:bg-black/10">
                      <span className="text-on-color/60">发起人</span>
                      <Avatar
                        name={initiatorName}
                        src={getFileURL(initiator?.avatar_url ?? "")}
                        size={18}
                        showTooltip={false}
                        className="ring-1 ring-white/25 dark:ring-black/25"
                      />
                      <span className="max-w-36 truncate font-medium text-on-color">{initiatorName}</span>
                    </span>
                  </div>
                  <h1 className="mt-4 max-w-3xl text-24 font-semibold tracking-[-0.025em] text-balance break-words text-on-color md:text-28">
                    {change.name}
                  </h1>
                  <p className="mt-2 max-w-2xl text-12 leading-5 text-pretty text-on-color/80">
                    {reviewStatusDescription[change.status]}
                  </p>
                </div>
                <div className="border-t border-white/15 bg-white/10 px-5 py-6 md:px-8 xl:border-t-0 xl:border-l xl:px-6 xl:py-8 dark:border-black/15 dark:bg-black/10">
                  <p className="mb-5 text-12 font-semibold text-on-color">
                    {change.review_progress.pending > 0
                      ? `还需 ${change.review_progress.pending} 位评审人完成决定`
                      : "本轮评审意见已全部收集"}
                  </p>
                  <RequirementReviewProgress change={change} variant="inverse" />
                </div>
              </div>
              <div className="relative flex flex-wrap items-center gap-2 border-t border-white/15 bg-white/10 px-5 py-3.5 text-11 text-on-color md:px-8 dark:border-black/15 dark:bg-black/10">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-on-color/80 dark:border-black/20 dark:bg-black/10">
                  <span className="text-on-color/60">基线</span>
                  <span className="font-semibold text-on-color">
                    {change.base_version_number ? `V${change.base_version_number}` : "新建需求"}
                  </span>
                </span>
                <ArrowRight className="size-3.5 text-on-color/60" aria-hidden="true" />
                <span className="rounded-md bg-white px-2.5 py-1.5 font-semibold text-accent-primary shadow-raised-100 dark:bg-black">
                  本轮提案
                </span>
                <span className="mx-1 hidden h-4 w-px bg-white/25 sm:block dark:bg-black/25" aria-hidden="true" />
                <span className="inline-flex items-center gap-1.5 text-on-color/80 tabular-nums">
                  <GitCompareArrows className="size-3.5" aria-hidden="true" />
                  {change.diff.changed_count} 个字段变更
                </span>
              </div>
            </section>

            {showDecision && (
              <div className="mt-5 xl:hidden">
                <RequirementReviewDecisionPanel
                  idPrefix="mobile-review"
                  opinion={opinion}
                  reason={reason}
                  isMutating={isMutating}
                  onOpinionChange={setOpinion}
                  onReasonChange={setReason}
                  onSubmit={handleSubmit}
                />
              </div>
            )}

            <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <main className="min-w-0">
                <RequirementDiffPanel change={change} />
              </main>
              <aside className="space-y-4 xl:sticky xl:top-4">
                {showDecision && (
                  <div className="hidden xl:block">
                    <RequirementReviewDecisionPanel
                      idPrefix="desktop-review"
                      opinion={opinion}
                      reason={reason}
                      isMutating={isMutating}
                      onOpinionChange={setOpinion}
                      onReasonChange={setReason}
                      onSubmit={handleSubmit}
                    />
                  </div>
                )}
                {!change.can_review && change.status === "pending" && <RequirementReviewUnavailableNotice />}
                <RequirementReviewHistory change={change} />
              </aside>
            </div>
          </div>
        )}
      </ContentWrapper>
    </>
  );
});
