import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useOutletContext } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ClipboardCheck,
  GitCompareArrows,
  History,
  Package,
  Pencil,
  Users,
} from "lucide-react";
import { Button } from "@plane/propel/button";
import { Avatar, Breadcrumbs, CustomSelect, Header } from "@plane/ui";
import { calculateTimeAgo, getFileURL } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useRequirementModules } from "@/hooks/store/use-requirement-modules";
import { useRequirementReview } from "@/hooks/store/use-requirement-review";
import { useUserRequirements } from "@/hooks/store/use-user-requirements";
import { useAppRouter } from "@/hooks/use-app-router";
import type { TRequirementDiff, TRequirementType } from "@/services/requirement.service";
import type { TProductDetailOutletContext } from "../product-detail-layout";
import { RequirementFormModal } from "./requirement-form-modal";
import { RequirementDiffResultPanel, RequirementStatusBadge } from "./requirement-review-panels";

const priorityLabels: Record<string, string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
  none: "无",
};

export const RequirementDetailRoot = observer(function RequirementDetailRoot(props: {
  requirementType: TRequirementType;
}) {
  const { requirementType } = props;
  const { productId, requirementId, workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const id = productId?.toString();
  const reqId = requirementId?.toString();
  const router = useAppRouter();
  const { product } = useOutletContext<TProductDetailOutletContext>();
  const { changes, compare, fetchDetail, fetchVersion, isLoading, requirement, versionDetail, versions } =
    useRequirementReview(slug, id, requirementType);
  const { fetchModules, modules } = useRequirementModules(slug, id, requirementType);
  const { fetchParentOptions, fetchRequirement, updateRequirement } = useUserRequirements(slug, id, requirementType);
  const [isChangeOpen, setIsChangeOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number>();
  const [fromVersion, setFromVersion] = useState<number>();
  const [toVersion, setToVersion] = useState<number>();
  const [versionDiff, setVersionDiff] = useState<TRequirementDiff>();
  const label = requirementType === "user" ? "用户需求" : "研发需求";
  const path = requirementType === "user" ? "user-requirements" : "development-requirements";

  useEffect(() => {
    if (!reqId) return;
    void fetchDetail(reqId).catch(() => undefined);
    void fetchModules().catch(() => undefined);
  }, [fetchDetail, fetchModules, reqId]);

  useEffect(() => {
    if (versions.length === 0 || !reqId) return;
    const latest = versions[0].version;
    setSelectedVersion((current) => current ?? latest);
    setToVersion((current) => current ?? latest);
    setFromVersion((current) => current ?? versions[1]?.version ?? latest);
  }, [reqId, versions]);

  useEffect(() => {
    if (reqId && selectedVersion) void fetchVersion(reqId, selectedVersion).catch(() => undefined);
  }, [fetchVersion, reqId, selectedVersion]);

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
      <ContentWrapper className="overflow-y-auto bg-layer-1 px-4 py-6 md:px-8">
        <PageHead title={requirement?.name ?? label} />
        {isLoading ? (
          <div className="mx-auto max-w-6xl animate-pulse space-y-4">
            <div className="h-40 rounded-xl bg-surface-1" />
            <div className="h-80 rounded-xl bg-surface-1" />
          </div>
        ) : !requirement ? (
          <div className="grid h-full place-items-center text-13 text-secondary">需求不存在或无权访问。</div>
        ) : (
          <div className="mx-auto max-w-6xl space-y-6 pb-12">
            <section className="rounded-xl border border-subtle bg-surface-1 p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <RequirementStatusBadge status={requirement.status} />
                    <span className="rounded-full bg-layer-1 px-2.5 py-1 text-11 text-secondary">
                      V{requirement.current_version}
                    </span>
                    <span className="rounded-full bg-layer-1 px-2.5 py-1 text-11 text-secondary">
                      {priorityLabels[requirement.priority]}优先级
                    </span>
                  </div>
                  <h1 className="mt-4 text-24 font-semibold tracking-tight break-words text-primary">
                    {requirement.name}
                  </h1>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-12 text-secondary">
                    <span>模块：{requirement.module_detail?.name ?? "未分配"}</span>
                    <span>父需求：{requirement.parent_detail?.name ?? "无"}</span>
                    <span>负责人：{requirement.assignee_detail?.display_name ?? "未分配"}</span>
                  </div>
                </div>
                <div className="min-w-64 rounded-lg border border-subtle bg-layer-1 p-4">
                  <p className="flex items-center gap-2 text-11 font-medium text-secondary">
                    <Users className="size-3.5" /> 当前评审人
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {requirement.reviewer_details.map((reviewer) => (
                      <span
                        key={reviewer.id}
                        className="flex items-center gap-1.5 rounded-full bg-surface-1 px-2 py-1 text-11 text-primary"
                      >
                        <Avatar name={reviewer.display_name} src={getFileURL(reviewer.avatar_url)} size="sm" />
                        {reviewer.display_name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <section className="rounded-xl border border-subtle bg-surface-1 p-5">
                  <h2 className="text-14 font-semibold text-primary">需求描述</h2>
                  <div
                    className="prose-sm dark:prose-invert mt-4 max-w-none text-secondary prose"
                    dangerouslySetInnerHTML={{ __html: requirement.description_html ?? "<p>暂无描述</p>" }}
                  />
                </section>
                <section className="rounded-xl border border-subtle bg-surface-1 p-5">
                  <h2 className="text-14 font-semibold text-primary">验收标准</h2>
                  <div
                    className="prose-sm dark:prose-invert mt-4 max-w-none text-secondary prose"
                    dangerouslySetInnerHTML={{
                      __html: requirement.acceptance_criteria_html ?? "<p>暂无验收标准</p>",
                    }}
                  />
                </section>

                <section className="rounded-xl border border-subtle bg-surface-1 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <GitCompareArrows className="size-4 text-tertiary" />
                    <h2 className="text-14 font-semibold text-primary">版本对比</h2>
                  </div>
                  {versions.length < 2 ? (
                    <p className="rounded-lg border border-dashed border-subtle py-8 text-center text-12 text-secondary">
                      至少生成两个版本后才能查看版本差异。
                    </p>
                  ) : (
                    <>
                      <div className="mb-5 flex flex-wrap items-center gap-2">
                        <CustomSelect
                          value={fromVersion}
                          onChange={(value: number) => setFromVersion(value)}
                          label={`V${fromVersion}`}
                          buttonClassName="h-9 w-28"
                        >
                          {versions.map((version) => (
                            <CustomSelect.Option key={version.id} value={version.version}>
                              V{version.version}
                            </CustomSelect.Option>
                          ))}
                        </CustomSelect>
                        <ArrowRight className="size-4 text-tertiary" />
                        <CustomSelect
                          value={toVersion}
                          onChange={(value: number) => setToVersion(value)}
                          label={`V${toVersion}`}
                          buttonClassName="h-9 w-28"
                        >
                          {versions.map((version) => (
                            <CustomSelect.Option key={version.id} value={version.version}>
                              V{version.version}
                            </CustomSelect.Option>
                          ))}
                        </CustomSelect>
                        <Button
                          variant="secondary"
                          size="lg"
                          disabled={!fromVersion || !toVersion}
                          onClick={async () => {
                            if (!fromVersion || !toVersion) return;
                            const response = await compare(reqId, { from_version: fromVersion, to_version: toVersion });
                            setVersionDiff(response);
                          }}
                        >
                          对比
                        </Button>
                        {requirement.latest_change?.status === "pending" && (
                          <Button
                            variant="secondary"
                            size="lg"
                            disabled={!fromVersion}
                            onClick={async () => {
                              if (!fromVersion || !requirement.latest_change) return;
                              const response = await compare(reqId, {
                                from_version: fromVersion,
                                to_change_id: requirement.latest_change.id,
                              });
                              setVersionDiff(response);
                            }}
                          >
                            与当前提案对比
                          </Button>
                        )}
                      </div>
                      {versionDiff && <RequirementDiffResultPanel diff={versionDiff} />}
                    </>
                  )}
                </section>
              </div>

              <aside className="space-y-5 lg:sticky lg:top-4">
                <section className="rounded-xl border border-subtle bg-surface-1">
                  <div className="flex items-center gap-2 border-b border-subtle px-4 py-3">
                    <History className="size-4 text-tertiary" />
                    <h2 className="text-13 font-semibold text-primary">版本记录</h2>
                  </div>
                  <div className="p-3">
                    <CustomSelect
                      value={selectedVersion}
                      onChange={(value: number) => setSelectedVersion(value)}
                      label={selectedVersion ? `V${selectedVersion}` : "选择版本"}
                      buttonClassName="h-9 w-full"
                    >
                      {versions.map((version) => (
                        <CustomSelect.Option key={version.id} value={version.version}>
                          V{version.version} · {calculateTimeAgo(version.created_at)}
                        </CustomSelect.Option>
                      ))}
                    </CustomSelect>
                    {versionDetail?.snapshot && (
                      <div className="mt-3 space-y-2 rounded-lg bg-layer-1 p-3 text-11 text-secondary">
                        <p className="font-medium text-primary">{versionDetail.snapshot.name}</p>
                        <p>优先级：{priorityLabels[versionDetail.snapshot.priority ?? "none"]}</p>
                        <p>模块：{versionDetail.snapshot.module?.name ?? "未分配"}</p>
                        <p>负责人：{versionDetail.snapshot.assignee?.display_name ?? "未分配"}</p>
                        <p>
                          评审人：
                          {versionDetail.snapshot.reviewers?.map((item) => item.display_name).join("、") || "无"}
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-subtle bg-surface-1">
                  <div className="border-b border-subtle px-4 py-3">
                    <h2 className="text-13 font-semibold text-primary">变更与评审历史</h2>
                  </div>
                  <div className="divide-y divide-subtle">
                    {changes.map((change) => (
                      <button
                        key={change.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-layer-1"
                        onClick={() => router.push(`/${slug}/products/${id}/${path}/${reqId}/review/${change.id}`)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-12 font-medium text-primary">
                            第 {change.sequence} 轮
                          </span>
                          <span className="mt-0.5 block text-10 text-tertiary">
                            {calculateTimeAgo(change.created_at)}
                          </span>
                        </span>
                        <span className="shrink-0 text-10 text-secondary">
                          {change.status === "pending"
                            ? "评审中"
                            : change.status === "approved"
                              ? "已通过"
                              : change.status === "rejected"
                                ? "已拒绝"
                                : "已替代"}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full justify-center"
                  prependIcon={<ChevronLeft className="size-4" />}
                  onClick={() => router.push(`/${slug}/products/${id}/${path}`)}
                >
                  返回{label}列表
                </Button>
              </aside>
            </div>
          </div>
        )}
      </ContentWrapper>
    </>
  );
});
