import { type ReactNode, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import { useOutletContext } from "react-router";
import {
  Archive,
  ArchiveRestore,
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
  RotateCcw,
  Send,
  SignalHigh,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@plane/propel/button";
import { TabNavigationItem, TabNavigationList } from "@plane/propel/tab-navigation";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Avatar, Breadcrumbs, Header } from "@plane/ui";
import { calculateTimeAgo, cn, getFileURL } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { PageHead } from "@/components/core/page-title";
import { useRequirementModules } from "@/hooks/store/use-requirement-modules";
import { useRequirementReview } from "@/hooks/store/use-requirement-review";
import { useStructuredRequirementDraft } from "@/hooks/store/use-structured-requirement-draft";
import { useUserRequirements } from "@/hooks/store/use-user-requirements";
import { useAppRouter } from "@/hooks/use-app-router";
import useReloadConfirmations from "@/hooks/use-reload-confirmation";
import { useRequirementAttachmentDownload } from "@/hooks/use-requirement-attachment-download";
import type { TRequirementType, TUserRequirementListItem } from "@/services/requirement.service";
import type { TProductDetailOutletContext } from "../product-detail-layout";
import { RequirementActivity } from "./requirement-activity";
import { RequirementFormModal } from "./requirement-form-modal";
import { RequirementLifecycleModal } from "./requirement-lifecycle-modal";
import { RequirementStatusBadge } from "./requirement-review-panels";
import { RequirementVersionCompareModal } from "./requirement-version-compare-modal";
import type { TStructuredSaveStatus } from "./structured-data-grid";
import { StructuredRequirementInfoEditor } from "./structured-requirement-info-editor";
import { StructuredRequirementEditor, type TStructuredRequirementEditorHandle } from "./structured-requirement-editor";

const priorityLabels: Record<string, string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
  none: "无",
};

const getRequirementPath = (requirementType: TRequirementType) =>
  requirementType === "user" ? "user-requirements" : "development-requirements";

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
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") === "details" ? "details" : "info";
  const requestedEdit = searchParams.get("edit") === "1";
  const initialRequestRef = useRef<{ requirementId?: string; tab: "info" | "details"; edit: boolean }>();
  if (initialRequestRef.current?.requirementId !== reqId) {
    initialRequestRef.current = { requirementId: reqId, tab: requestedTab, edit: requestedEdit };
  }
  const { download: downloadAttachment } = useRequirementAttachmentDownload(slug, id);
  const { product } = useOutletContext<TProductDetailOutletContext>();
  const { changes, compare, fetchDetail, isLoading, lifecycleEvents, requirement, versions } = useRequirementReview(
    slug,
    id,
    requirementType
  );
  const { fetchModules, modules } = useRequirementModules(slug, id, requirementType);
  const {
    discardChangeDraft,
    fetchParentOptions,
    fetchRequirement,
    patchChangeDraft,
    saveChangeDraft,
    setArchived,
    startChangeDraft,
    submitChange,
    transitionLifecycle,
    updateRequirement,
    withdrawChange,
  } = useUserRequirements(slug, id, requirementType);
  const [isChangeOpen, setIsChangeOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "details">("info");
  const [isEditing, setIsEditing] = useState(false);
  const [structuredSaveStatus, setStructuredSaveStatus] = useState<TStructuredSaveStatus>("saved");
  const [isSchemaDirty, setIsSchemaDirty] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<"closed" | "reopened" | null>(null);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [simpleAction, setSimpleAction] = useState<"archive" | "restore" | "withdraw" | "discard" | "submit" | null>(
    null
  );
  const label = requirementType === "user" ? "用户需求" : "研发需求";
  const path = getRequirementPath(requirementType);
  const structuredEditorRef = useRef<TStructuredRequirementEditorHandle>(null);
  const openDraft = requirement?.open_change?.status === "draft" ? requirement.open_change : null;
  const canSubmitStructured = Boolean(
    requirement?.content_mode === "structured" && isEditing && openDraft && requirement.permissions.can_edit_draft
  );
  const structuredRevisionId = isEditing
    ? (openDraft?.structured_revision_id ?? null)
    : requirement?.current_version
      ? (requirement.active_structured_revision ?? null)
      : (requirement?.open_change?.structured_revision_id ??
        requirement?.latest_change?.structured_revision_id ??
        null);

  const draftSession = useStructuredRequirementDraft({
    workspaceSlug: slug ?? "",
    productId: id ?? "",
    requirementId: reqId ?? "",
    change: openDraft,
    enabled: Boolean(isEditing && openDraft),
    patchChangeDraft,
  });
  const hasPendingLocalChanges =
    isEditing && (draftSession.saveStatus !== "saved" || structuredSaveStatus !== "saved" || isSchemaDirty);
  const { setShowAlert } = useReloadConfirmations(isEditing, "当前修订还有尚未保存或未应用的修改，确定离开吗？");

  useEffect(() => setShowAlert(hasPendingLocalChanges), [hasPendingLocalChanges, setShowAlert]);

  useEffect(() => {
    if (!reqId) return;
    const initialRequest = initialRequestRef.current;
    setActiveTab(initialRequest?.tab ?? "info");
    setIsEditing(false);
    void fetchDetail(reqId)
      .then(async (detail) => {
        if (!initialRequest?.edit || detail?.content_mode !== "structured") return detail;
        let editableDetail = detail;
        if (!editableDetail.open_change && editableDetail.permissions.can_create_revision) {
          await startChangeDraft(reqId);
          editableDetail = (await fetchDetail(reqId)) ?? editableDetail;
        }
        if (editableDetail.open_change?.status === "draft" && editableDetail.permissions.can_edit_draft) {
          setIsEditing(true);
        }
        return editableDetail;
      })
      .catch(() => undefined);
    void fetchModules().catch(() => undefined);
  }, [fetchDetail, fetchModules, reqId, startChangeDraft]);

  const showActionError = (error: unknown, fallback = "请稍后重试。") =>
    setToast({
      type: TOAST_TYPE.ERROR,
      title: "操作失败",
      message:
        (error as { error?: string; message?: string })?.error ?? (error as { message?: string })?.message ?? fallback,
    });

  const updateDetailQuery = (editing: boolean, tab = activeTab) => {
    if (!slug || !id || !reqId) return;
    router.replace(`/${slug}/products/${id}/${path}/${reqId}?tab=${tab}${editing ? "&edit=1" : ""}`);
  };

  const enterStructuredEdit = async () => {
    if (!reqId || !requirement || requirement.content_mode !== "structured") return;
    setIsActionSubmitting(true);
    try {
      if (!openDraft) await startChangeDraft(reqId);
      const detail = await fetchDetail(reqId);
      if (detail?.open_change?.status === "draft" && detail.permissions.can_edit_draft) {
        setStructuredSaveStatus("saved");
        setIsSchemaDirty(false);
        setIsEditing(true);
        updateDetailQuery(true);
        return;
      }
      throw new Error(detail?.open_change?.status === "pending" ? "该修订已进入评审" : "无法进入编辑状态");
    } catch (error) {
      const detail = await fetchDetail(reqId).catch(() => undefined);
      if (detail?.open_change?.status === "draft" && detail.permissions.can_edit_draft) {
        setIsEditing(true);
        updateDetailQuery(true);
        return;
      }
      showActionError(error);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const changeTab = async (nextTab: "info" | "details") => {
    if (nextTab === activeTab) return;
    try {
      if (isEditing && activeTab === "details") {
        if (structuredEditorRef.current?.hasUnappliedSchemaChanges()) {
          structuredEditorRef.current.openSchema();
          setToast({ type: TOAST_TYPE.ERROR, title: "字段方案尚未应用", message: "请先应用或撤销字段方案修改。" });
          return;
        }
        await structuredEditorRef.current?.flushPendingChanges();
      }
      if (isEditing && activeTab === "info") await draftSession.flush();
      setActiveTab(nextTab);
      updateDetailQuery(isEditing, nextTab);
    } catch (error) {
      showActionError(error, "当前修改保存失败，暂时不能切换页签。");
    }
  };

  const exitStructuredEdit = async () => {
    if (!reqId) return;
    if (isSchemaDirty || structuredEditorRef.current?.hasUnappliedSchemaChanges()) {
      setActiveTab("details");
      queueMicrotask(() => structuredEditorRef.current?.openSchema());
      setToast({ type: TOAST_TYPE.ERROR, title: "字段方案尚未应用", message: "请先应用或撤销字段方案修改。" });
      return;
    }
    setIsActionSubmitting(true);
    try {
      await draftSession.flush();
      await structuredEditorRef.current?.flushPendingChanges();
      await fetchDetail(reqId);
      setIsEditing(false);
      setStructuredSaveStatus("saved");
      updateDetailQuery(false);
    } catch (error) {
      showActionError(error, "草稿保存失败，暂时不能退出编辑。");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const prepareStructuredSubmit = async () => {
    if (!canSubmitStructured) return;
    const metadataIsValid = await draftSession.validateForSubmit();
    if (!metadataIsValid) {
      setActiveTab("info");
      setToast({ type: TOAST_TYPE.ERROR, title: "基础信息不完整", message: "请填写需求名称并至少选择一名评审人。" });
      return;
    }
    if (isSchemaDirty || structuredEditorRef.current?.hasUnappliedSchemaChanges()) {
      setActiveTab("details");
      queueMicrotask(() => structuredEditorRef.current?.openSchema());
      setToast({ type: TOAST_TYPE.ERROR, title: "字段方案尚未应用", message: "请先应用或撤销字段方案修改。" });
      return;
    }
    setIsActionSubmitting(true);
    try {
      await draftSession.flush();
      await structuredEditorRef.current?.flushPendingChanges();
      setSimpleAction("submit");
    } catch (error) {
      setActiveTab("details");
      showActionError(error, "需求明细保存失败，无法提交评审。");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const retryDraftSave = async () => {
    setIsActionSubmitting(true);
    try {
      await draftSession.retry();
      await structuredEditorRef.current?.flushPendingChanges();
      setStructuredSaveStatus("saved");
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存", message: "修改已保存到修订草稿。" });
    } catch (error) {
      showActionError(error, "草稿仍未保存，请检查输入或网络后重试。");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const saveStatus = isSchemaDirty
    ? { label: "字段方案未应用", className: "text-warning-primary" }
    : draftSession.saveStatus === "error" || structuredSaveStatus === "error"
      ? { label: "保存失败", className: "text-danger-primary" }
      : draftSession.saveStatus === "saving" || structuredSaveStatus === "saving"
        ? { label: "正在保存…", className: "text-tertiary" }
        : draftSession.saveStatus === "dirty" || structuredSaveStatus === "dirty"
          ? { label: "未保存", className: "text-warning-primary" }
          : { label: "已保存到草稿", className: "text-success-primary" };

  const actionModalConfig =
    simpleAction === "submit"
      ? {
          variant: "primary" as const,
          primaryButtonText: { default: "提交评审", loading: "提交中…" },
          secondaryButtonText: "取消",
        }
      : simpleAction === "discard"
        ? {
            variant: "danger" as const,
            primaryButtonText: { default: "放弃草稿", loading: "放弃中…" },
            secondaryButtonText: "取消",
          }
        : {
            variant: "primary" as const,
            primaryButtonText: {
              default:
                simpleAction === "archive"
                  ? "归档"
                  : simpleAction === "restore"
                    ? "恢复"
                    : simpleAction === "withdraw"
                      ? "撤回评审"
                      : "确认",
              loading: "处理中…",
            },
            secondaryButtonText: "取消",
          };

  if (!slug || !id || !reqId) return null;

  return (
    <>
      <RequirementFormModal
        isOpen={isChangeOpen}
        workspaceSlug={slug}
        productId={id}
        requirementId={reqId}
        requirementLabel={label}
        requirementType={requirementType}
        modules={modules}
        fetchRequirement={fetchRequirement}
        fetchParentOptions={fetchParentOptions}
        onClose={() => setIsChangeOpen(false)}
        onSubmit={async (data, submitForReview) => {
          const openChange = requirement?.open_change;
          const hadOpenDraft = openChange?.status === "draft";
          const response = hadOpenDraft
            ? submitForReview
              ? await submitChange(reqId, openChange.id, data)
              : await saveChangeDraft(reqId, openChange.id, data)
            : await updateRequirement(reqId, data, submitForReview);
          await fetchDetail(reqId);
          // 仅「创建修订」刚生成草稿时切到需求明细；「编辑属性」保存后留在基础信息
          if (requirement?.content_mode === "structured" && !hadOpenDraft) {
            setActiveTab("details");
          }
          return response;
        }}
      />
      <RequirementLifecycleModal
        requirement={(requirement as TUserRequirementListItem | undefined) ?? null}
        action={lifecycleAction}
        isSubmitting={isActionSubmitting}
        onClose={() => setLifecycleAction(null)}
        onSubmit={async (data) => {
          setIsActionSubmitting(true);
          try {
            await transitionLifecycle(reqId, data);
            await fetchDetail(reqId);
            setLifecycleAction(null);
            setToast({ type: TOAST_TYPE.SUCCESS, title: "状态已更新", message: "需求生命周期状态已更新。" });
          } catch (error: any) {
            setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message: error?.error ?? "请稍后重试。" });
          } finally {
            setIsActionSubmitting(false);
          }
        }}
      />
      <AlertModalCore
        isOpen={!!simpleAction}
        title={
          simpleAction === "archive"
            ? "归档需求"
            : simpleAction === "restore"
              ? "恢复归档"
              : simpleAction === "withdraw"
                ? "撤回评审"
                : simpleAction === "submit"
                  ? "提交需求评审？"
                  : "放弃修订草稿"
        }
        content={
          simpleAction === "archive"
            ? "归档后需求将从默认列表隐藏。"
            : simpleAction === "restore"
              ? "恢复后需求仍保持当前终态。"
              : simpleAction === "withdraw"
                ? "当前评审会结束，并生成新的修订草稿。"
                : simpleAction === "submit"
                  ? `将把第 ${requirement?.open_change?.sequence ?? "当前"} 轮修订提交给 ${draftSession.form.getValues("reviewers")?.length ?? 0} 位评审人。提交后内容暂不可编辑；如需修改，可撤回评审后继续。`
                  : "修订草稿会被取消，当前正式版本不受影响。"
        }
        variant={actionModalConfig.variant}
        primaryButtonText={actionModalConfig.primaryButtonText}
        secondaryButtonText={actionModalConfig.secondaryButtonText}
        isSubmitting={isActionSubmitting}
        handleClose={() => setSimpleAction(null)}
        handleSubmit={async () => {
          if (!requirement || !simpleAction) return;
          setIsActionSubmitting(true);
          try {
            if (simpleAction === "archive" || simpleAction === "restore") {
              await setArchived(reqId, simpleAction === "archive");
            } else if (simpleAction === "withdraw" && requirement.open_change) {
              await withdrawChange(reqId, requirement.open_change.id);
            } else if (simpleAction === "discard" && requirement.open_change) {
              await draftSession.cancelPendingSaves();
              await structuredEditorRef.current?.cancelPendingChanges();
              await discardChangeDraft(reqId, requirement.open_change.id);
              await draftSession.cleanupUnboundAssets();
            } else if (simpleAction === "submit" && requirement.open_change) {
              await submitChange(reqId, requirement.open_change.id);
            }
            await fetchDetail(reqId);
            const isSubmit = simpleAction === "submit";
            if (["submit", "discard", "withdraw"].includes(simpleAction)) {
              setIsEditing(false);
              updateDetailQuery(false);
            }
            setStructuredSaveStatus("saved");
            setIsSchemaDirty(false);
            setSimpleAction(null);
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: isSubmit ? "已提交评审" : "操作成功",
              message: isSubmit ? "字段方案和数据已冻结。" : "需求已更新。",
            });
          } catch (error: any) {
            setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message: error?.error ?? "请稍后重试。" });
          } finally {
            setIsActionSubmitting(false);
          }
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
              {requirement?.content_mode === "structured" ? (
                <TabNavigationList>
                  {(
                    [
                      { key: "info" as const, label: "基础信息" },
                      { key: "details" as const, label: "需求明细" },
                    ] as const
                  ).map((tab) => (
                    <button key={tab.key} type="button" onClick={() => void changeTab(tab.key)}>
                      <TabNavigationItem isActive={activeTab === tab.key}>{tab.label}</TabNavigationItem>
                    </button>
                  ))}
                </TabNavigationList>
              ) : (
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
              )}
            </Header.LeftItem>
            <Header.RightItem>
              {requirement && (
                <>
                  {!isEditing && activeTab !== "details" && (
                    <Button
                      variant="secondary"
                      size="lg"
                      prependIcon={<ClipboardCheck className="size-4" />}
                      onClick={() => router.push(`/${slug}/products/${id}/${path}/${reqId}/review`)}
                    >
                      查看评审
                    </Button>
                  )}
                  {requirement.content_mode === "structured" ? (
                    isEditing ? (
                      <>
                        <span className={cn("px-1 text-11 font-medium", saveStatus.className)}>{saveStatus.label}</span>
                        {(draftSession.saveStatus === "error" || structuredSaveStatus === "error") && (
                          <Button variant="secondary" size="sm" onClick={() => void retryDraftSave()}>
                            重试保存
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="lg"
                          loading={isActionSubmitting}
                          onClick={() => void exitStructuredEdit()}
                        >
                          退出编辑
                        </Button>
                        <Button
                          variant="primary"
                          size="lg"
                          prependIcon={<Send className="size-4" />}
                          loading={isActionSubmitting}
                          onClick={() => void prepareStructuredSubmit()}
                        >
                          提交评审
                        </Button>
                      </>
                    ) : (
                      (requirement.permissions.can_edit_draft || requirement.permissions.can_create_revision) && (
                        <Button
                          variant="primary"
                          size="lg"
                          prependIcon={<Pencil className="size-4" />}
                          loading={isActionSubmitting}
                          onClick={() => void enterStructuredEdit()}
                        >
                          {requirement.permissions.can_edit_draft ? "继续编辑" : "编辑需求"}
                        </Button>
                      )
                    )
                  ) : (
                    (requirement.permissions.can_edit_draft || requirement.permissions.can_create_revision) && (
                      <Button
                        variant="primary"
                        size="lg"
                        prependIcon={<Pencil className="size-4" />}
                        onClick={() => setIsChangeOpen(true)}
                      >
                        {requirement.permissions.can_edit_draft ? "继续编辑草稿" : "创建修订"}
                      </Button>
                    )
                  )}
                  {!isEditing && requirement.permissions.can_withdraw && (
                    <Button variant="secondary" size="lg" onClick={() => setSimpleAction("withdraw")}>
                      撤回评审
                    </Button>
                  )}
                  {requirement.permissions.can_discard_draft && (
                    <Button variant="secondary" size="lg" onClick={() => setSimpleAction("discard")}>
                      放弃草稿
                    </Button>
                  )}
                  {!isEditing && requirement.permissions.can_close && (
                    <Button variant="secondary" size="lg" onClick={() => setLifecycleAction("closed")}>
                      关闭需求
                    </Button>
                  )}
                  {!isEditing && requirement.permissions.can_reopen && (
                    <Button
                      variant="primary"
                      size="lg"
                      prependIcon={<RotateCcw className="size-4" />}
                      onClick={() => setLifecycleAction("reopened")}
                    >
                      重新打开
                    </Button>
                  )}
                  {!isEditing && requirement.permissions.can_archive && (
                    <Button
                      variant="secondary"
                      size="lg"
                      prependIcon={<Archive className="size-4" />}
                      onClick={() => setSimpleAction("archive")}
                    >
                      归档
                    </Button>
                  )}
                  {!isEditing && requirement.permissions.can_restore && (
                    <Button
                      variant="primary"
                      size="lg"
                      prependIcon={<ArchiveRestore className="size-4" />}
                      onClick={() => setSimpleAction("restore")}
                    >
                      恢复归档
                    </Button>
                  )}
                </>
              )}
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
        ) : requirement.content_mode === "structured" && activeTab === "details" ? (
          <div className="h-full min-h-0 overflow-hidden bg-surface-1">
            {structuredRevisionId ? (
              <StructuredRequirementEditor
                key={structuredRevisionId}
                ref={structuredEditorRef}
                workspaceSlug={slug}
                productId={id}
                requirementId={reqId}
                revisionId={structuredRevisionId}
                editable={canSubmitStructured}
                onSaveStatusChange={setStructuredSaveStatus}
                onSchemaDirtyChange={setIsSchemaDirty}
              />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center">
                <div>
                  <p className="text-13 font-medium text-primary">当前需求还没有结构化修订数据</p>
                  <p className="mt-1.5 max-w-sm text-12 text-secondary">
                    {requirement.permissions.can_create_revision
                      ? "点击编辑后，系统会自动创建修订草稿并复制当前正式版本。"
                      : requirement.permissions.can_edit_draft
                        ? "当前草稿未关联结构化修订，请刷新页面；若仍如此，可尝试重新打开该需求。"
                        : "需求尚未生效，且当前没有可编辑的修订草稿。"}
                  </p>
                  {requirement.permissions.can_create_revision && (
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      className="mt-4"
                      prependIcon={<Pencil className="size-4" />}
                      loading={isActionSubmitting}
                      onClick={() => void enterStructuredEdit()}
                    >
                      编辑需求
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : requirement.content_mode === "structured" && isEditing ? (
          <StructuredRequirementInfoEditor
            workspaceSlug={slug}
            productId={id}
            requirementId={reqId}
            status={requirement.status}
            currentVersion={requirement.current_version}
            modules={modules}
            session={draftSession}
            fetchParentOptions={fetchParentOptions}
          >
            <RequirementActivity
              workspaceSlug={slug}
              productId={id}
              requirementId={reqId}
              requirementType={requirementType}
              changes={changes}
              versions={versions}
              lifecycleEvents={lifecycleEvents}
              readOnly
              onOpenReview={(changeId) => router.push(`/${slug}/products/${id}/${path}/${reqId}/review/${changeId}`)}
            />
          </StructuredRequirementInfoEditor>
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

              {requirement.content_mode !== "structured" && (
                <>
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
                </>
              )}

              <RequirementActivity
                workspaceSlug={slug}
                productId={id}
                requirementId={reqId}
                requirementType={requirementType}
                changes={changes}
                versions={versions}
                lifecycleEvents={lifecycleEvents}
                readOnly={requirement.archived_at !== null || requirement.status === "closed"}
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
                    <RequirementStatusBadge status={requirement.status} plain />
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
                  {requirement.closed_at && (
                    <SidebarRow icon={CalendarClock} label="关闭时间">
                      {calculateTimeAgo(requirement.closed_at)}
                    </SidebarRow>
                  )}
                  {requirement.archived_at && (
                    <SidebarRow icon={Archive} label="归档时间">
                      {calculateTimeAgo(requirement.archived_at)}
                    </SidebarRow>
                  )}
                  <SidebarRow icon={Boxes} label="所属模块">
                    <span className="truncate">{requirement.module_detail?.name ?? "未分配"}</span>
                  </SidebarRow>
                  <SidebarRow icon={GitFork} label="父需求">
                    {requirement.parent_detail ? (
                      <button
                        type="button"
                        title={requirement.parent_detail.name}
                        aria-label={`打开父需求 ${requirement.parent_detail.name}`}
                        onClick={() =>
                          router.push(
                            `/${slug}/products/${id}/${getRequirementPath(requirement.parent_detail!.type)}/${requirement.parent_detail!.id}`
                          )
                        }
                        className="focus-visible:ring-accent-primary/30 -ml-1.5 max-w-full min-w-0 truncate rounded-sm px-1.5 py-1 text-left transition-colors hover:bg-layer-1 hover:text-primary focus-visible:ring-2 focus-visible:outline-none"
                      >
                        {requirement.parent_detail.name}
                      </button>
                    ) : (
                      "无"
                    )}
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

                <SectionGroup
                  title="子需求"
                  action={
                    <span className="text-caption-sm-regular text-tertiary">
                      {requirement.sub_requirements.length} 个
                    </span>
                  }
                >
                  {requirement.sub_requirements.length > 0 ? (
                    <ul className="w-full divide-y divide-subtle">
                      {requirement.sub_requirements.map((subRequirement) => (
                        <li key={subRequirement.id} className="min-w-0">
                          <button
                            type="button"
                            title={subRequirement.name}
                            aria-label={`打开子需求 ${subRequirement.name}`}
                            onClick={() =>
                              router.push(
                                `/${slug}/products/${id}/${getRequirementPath(subRequirement.type)}/${subRequirement.id}`
                              )
                            }
                            className="focus-visible:ring-accent-primary/30 block w-full truncate rounded-sm px-2 py-2 text-left text-body-xs-medium text-secondary transition-colors hover:bg-layer-1 hover:text-primary focus-visible:ring-2 focus-visible:outline-none"
                          >
                            {subRequirement.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-body-xs-regular text-placeholder">暂无子需求</p>
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
