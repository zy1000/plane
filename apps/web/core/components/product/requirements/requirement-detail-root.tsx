import { type ReactNode, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useOutletContext } from "react-router";
import {
  Boxes,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Download,
  GitCompareArrows,
  GitFork,
  Layers3,
  Package,
  Paperclip,
  Pencil,
  SignalHigh,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@plane/propel/button";
import { Avatar, Breadcrumbs, Header } from "@plane/ui";
import { calculateTimeAgo, cn, getFileURL } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { PageHead } from "@/components/core/page-title";
import { useRequirementModules } from "@/hooks/store/use-requirement-modules";
import { useRequirementReview } from "@/hooks/store/use-requirement-review";
import { useUserRequirements } from "@/hooks/store/use-user-requirements";
import { useAppRouter } from "@/hooks/use-app-router";
import { useRequirementAttachmentDownload } from "@/hooks/use-requirement-attachment-download";
import type { TRequirementType } from "@/services/requirement.service";
import type { TProductDetailOutletContext } from "../product-detail-layout";
import { RequirementActivity } from "./requirement-activity";
import { RequirementFormModal } from "./requirement-form-modal";
import { RequirementStatusBadge } from "./requirement-review-panels";
import { RequirementVersionCompareModal } from "./requirement-version-compare-modal";

const priorityLabels: Record<string, string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
  none: "无",
};

/** 右侧属性栏分组：加粗标题 + 可折叠箭头，风格对齐工作项详情页的「属性」侧边栏 */
function SectionGroup(props: { title: string; action?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const { title, action, defaultOpen = true, children } = props;
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="w-full">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-2 text-body-sm-semibold text-primary outline-none focus-visible:outline-none"
        >
          <span>{title}</span>
          <span
            className={cn(
              "h-0 w-0 border-t-[5px] border-r-[4px] border-l-[4px] border-t-current border-r-transparent border-l-transparent transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90"
            )}
            aria-hidden
          />
        </button>
        {action}
      </div>
      {open && <div className="mt-2 w-full space-y-2">{children}</div>}
    </section>
  );
}

/** 右侧属性行：固定宽度 label + 弹性 value，风格对齐工作项属性栏 */
function SidebarRow(props: { icon: LucideIcon; label: string; children: ReactNode }) {
  const { children, icon: Icon, label } = props;
  return (
    <div className="flex w-full items-start gap-2">
      <div className="flex h-7.5 w-30 shrink-0 items-center gap-1.5 text-body-xs-regular text-tertiary">
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex min-h-7.5 min-w-0 flex-1 flex-wrap items-center gap-1 text-body-xs-medium text-secondary">
        {children}
      </div>
    </div>
  );
}

function hasContent(value?: string | null) {
  if (value && /<(img|video|iframe|table)\b/i.test(value)) return true;
  return Boolean(
    value
      ?.replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim()
  );
}

export const RequirementDetailRoot = observer(function RequirementDetailRoot(props: {
  requirementType: TRequirementType;
}) {
  const { requirementType } = props;
  const { productId, requirementId, workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const id = productId?.toString();
  const reqId = requirementId?.toString();
  const router = useAppRouter();
  const { download: downloadAttachment } = useRequirementAttachmentDownload(slug, id);
  const { product } = useOutletContext<TProductDetailOutletContext>();
  const { changes, compare, fetchDetail, isLoading, requirement, versions } = useRequirementReview(
    slug,
    id,
    requirementType
  );
  const { fetchModules, modules } = useRequirementModules(slug, id, requirementType);
  const { fetchParentOptions, fetchRequirement, updateRequirement } = useUserRequirements(slug, id, requirementType);
  const [isChangeOpen, setIsChangeOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const label = requirementType === "user" ? "用户需求" : "研发需求";
  const path = requirementType === "user" ? "user-requirements" : "development-requirements";

  useEffect(() => {
    if (!reqId) return;
    void fetchDetail(reqId).catch(() => undefined);
    void fetchModules().catch(() => undefined);
  }, [fetchDetail, fetchModules, reqId]);

  if (!slug || !id || !reqId) return null;

  return (
    <>
      <RequirementFormModal
        isOpen={isChangeOpen}
        workspaceSlug={slug}
        productId={id}
        requirementId={reqId}
        requirementLabel={label}
        modules={modules}
        fetchRequirement={fetchRequirement}
        fetchParentOptions={fetchParentOptions}
        onClose={() => setIsChangeOpen(false)}
        onSubmit={async (data) => {
          const response = await updateRequirement(reqId, data);
          await fetchDetail(reqId);
          return response;
        }}
      />
      {requirement && (
        <RequirementVersionCompareModal
          isOpen={isCompareOpen}
          versions={versions}
          latestChange={requirement.latest_change}
          onClose={() => setIsCompareOpen(false)}
          onCompare={(params) => compare(reqId, params)}
        />
      )}
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
                {requirement && <Breadcrumbs.Item component={<BreadcrumbLink label={requirement.name} />} />}
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem>
              <Button
                variant="secondary"
                size="lg"
                prependIcon={<ClipboardCheck className="size-4" />}
                onClick={() => router.push(`/${slug}/products/${id}/${path}/${reqId}/review`)}
              >
                查看评审
              </Button>
              <Button
                variant="primary"
                size="lg"
                prependIcon={<Pencil className="size-4" />}
                onClick={() => setIsChangeOpen(true)}
              >
                发起变更
              </Button>
            </Header.RightItem>
          </Header>
        }
      />
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface-1">
        <PageHead title={requirement?.name ?? label} />
        {isLoading ? (
          <div className="flex h-full w-full overflow-hidden">
            <div className="w-full animate-pulse space-y-4 p-4 py-5">
              <div className="h-7 w-1/2 rounded bg-surface-2" />
              <div className="h-5 w-2/3 rounded bg-surface-2" />
              <div className="h-40 rounded bg-surface-2" />
              <div className="h-40 rounded bg-surface-2" />
            </div>
            <div className="h-full w-[400px] flex-shrink-0 space-y-3 border-l border-subtle p-4 py-5">
              <div className="h-5 w-1/3 animate-pulse rounded bg-surface-2" />
              <div className="h-24 animate-pulse rounded bg-surface-2" />
              <div className="h-24 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        ) : !requirement ? (
          <div className="grid h-full place-items-center text-body-xs-regular text-secondary">
            需求不存在或无权访问。
          </div>
        ) : (
          <div className="vertical-scrollbar flex h-full w-full overflow-auto">
            {/* 左侧主内容 */}
            <div className="relative h-full w-full space-y-6 overflow-auto p-4 py-5">
              <div className="space-y-3">
                <h1 className="text-20 font-medium tracking-tight break-words text-primary">{requirement.name}</h1>

                {requirement.latest_change?.status === "pending" && (
                  <button
                    type="button"
                    className="border-accent-primary/20 group focus-visible:ring-accent-primary/30 flex w-full items-center justify-between gap-4 rounded-lg border bg-accent-primary/5 px-4 py-3 text-left transition-colors hover:bg-accent-primary/10 focus-visible:ring-2 focus-visible:outline-none"
                    onClick={() =>
                      router.push(
                        `/${slug}/products/${id}/${path}/${reqId}/review/${requirement.latest_change?.id ?? ""}`
                      )
                    }
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-primary/10 text-accent-primary">
                        <ClipboardCheck className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-body-xs-medium text-primary">
                          第 {requirement.latest_change.sequence} 轮变更正在评审
                        </span>
                        <span className="mt-0.5 block truncate text-caption-sm-regular text-secondary">
                          {requirement.current_version > 0
                            ? "当前页面展示已生效内容，可进入评审查看本轮提案。"
                            : "需求尚未生效，可进入评审查看当前提案。"}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-caption-sm-medium text-accent-primary">
                      查看评审
                      <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                )}
              </div>

              <section>
                <h2 className="text-body-sm-semibold text-primary">需求描述</h2>
                {hasContent(requirement.description_html) ? (
                  <div
                    className="prose-sm dark:prose-invert mt-3 max-w-none leading-7 text-secondary prose"
                    dangerouslySetInnerHTML={{ __html: requirement.description_html ?? "" }}
                  />
                ) : (
                  <p className="mt-2 text-body-xs-regular text-placeholder">暂无需求描述</p>
                )}
              </section>

              <section>
                <h2 className="text-body-sm-semibold text-primary">验收标准</h2>
                {hasContent(requirement.acceptance_criteria_html) ? (
                  <div
                    className="prose-sm dark:prose-invert mt-3 max-w-none leading-7 text-secondary prose"
                    dangerouslySetInnerHTML={{ __html: requirement.acceptance_criteria_html ?? "" }}
                  />
                ) : (
                  <p className="mt-2 text-body-xs-regular text-placeholder">暂无验收标准</p>
                )}
              </section>

              <RequirementActivity
                workspaceSlug={slug}
                productId={id}
                requirementId={reqId}
                requirementType={requirementType}
                changes={changes}
                versions={versions}
                onOpenReview={(changeId) => router.push(`/${slug}/products/${id}/${path}/${reqId}/review/${changeId}`)}
              />
            </div>

            {/* 右侧属性侧边栏 */}
            <div className="vertical-scrollbar scrollbar-sm h-full !w-[400px] flex-shrink-0 overflow-auto border-l border-subtle p-4 py-5">
              <h6 className="text-body-sm-semibold text-primary">属性</h6>
              <div className="mt-3 flex w-full flex-col gap-5">
                <SectionGroup
                  title="详情"
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      prependIcon={<GitCompareArrows className="size-3.5" />}
                      onClick={() => setIsCompareOpen(true)}
                    >
                      版本对比
                    </Button>
                  }
                >
                  <SidebarRow icon={CircleDot} label="状态">
                    <RequirementStatusBadge status={requirement.status} className="-ml-2.5" />
                  </SidebarRow>
                  <SidebarRow icon={SignalHigh} label="优先级">
                    {priorityLabels[requirement.priority] ?? "无"}
                  </SidebarRow>
                  <SidebarRow icon={UserRound} label="负责人">
                    {requirement.assignee_detail ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Avatar
                          name={requirement.assignee_detail.display_name}
                          src={getFileURL(requirement.assignee_detail.avatar_url)}
                          size="sm"
                        />
                        <span className="truncate">{requirement.assignee_detail.display_name}</span>
                      </span>
                    ) : (
                      "未分配"
                    )}
                  </SidebarRow>
                  <SidebarRow icon={Layers3} label="当前版本">
                    {requirement.current_version > 0 ? `V${requirement.current_version}` : "尚未生效"}
                  </SidebarRow>
                  <SidebarRow icon={Boxes} label="所属模块">
                    <span className="truncate">{requirement.module_detail?.name ?? "未分配"}</span>
                  </SidebarRow>
                  <SidebarRow icon={GitFork} label="父需求">
                    <span className="truncate">{requirement.parent_detail?.name ?? "无"}</span>
                  </SidebarRow>
                </SectionGroup>

                <SectionGroup title="评审人">
                  {requirement.reviewer_details.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {requirement.reviewer_details.map((reviewer) => (
                        <span
                          key={reviewer.id}
                          className="flex items-center gap-1.5 rounded-full border border-subtle px-2 py-1 text-caption-sm-medium text-primary"
                        >
                          <Avatar name={reviewer.display_name} src={getFileURL(reviewer.avatar_url)} size="sm" />
                          {reviewer.display_name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-body-xs-regular text-tertiary">未设置</p>
                  )}
                </SectionGroup>

                <SectionGroup
                  title="附件"
                  action={
                    <span className="text-caption-sm-regular text-tertiary">{requirement.attachments.length} 个</span>
                  }
                >
                  {requirement.attachments.length > 0 ? (
                    <div className="flex w-full flex-col gap-2">
                      {requirement.attachments.map((attachment) => (
                        <button
                          key={attachment.id}
                          type="button"
                          aria-label={`下载附件 ${attachment.attributes.name ?? "附件"}`}
                          onClick={() => downloadAttachment(attachment)}
                          className="group focus-visible:ring-accent-primary/30 flex w-full min-w-0 items-center gap-3 rounded-md border border-subtle px-3 py-2.5 text-left transition-colors hover:bg-layer-1 focus-visible:ring-2 focus-visible:outline-none"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-layer-1 text-tertiary">
                            <Paperclip className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body-xs-medium text-primary">
                              {attachment.attributes.name ?? "附件"}
                            </span>
                            <span className="mt-0.5 block text-caption-sm-regular text-tertiary">
                              上传于 {calculateTimeAgo(attachment.created_at)}
                            </span>
                          </span>
                          <Download className="size-3.5 shrink-0 text-tertiary transition-colors group-hover:text-accent-primary" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-body-xs-regular text-placeholder">暂无附件</p>
                  )}
                </SectionGroup>

                <div className="space-y-3 border-t border-subtle pt-4">
                  <div className="grid grid-cols-2 gap-y-1.5 text-caption-sm-regular text-tertiary">
                    <span className="flex items-center gap-1.5">
                      <CalendarPlus className="size-3.5 shrink-0" />
                      创建于
                    </span>
                    <span className="text-right">{calculateTimeAgo(requirement.created_at)}</span>
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="size-3.5 shrink-0" />
                      更新于
                    </span>
                    <span className="text-right">{calculateTimeAgo(requirement.updated_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
});
