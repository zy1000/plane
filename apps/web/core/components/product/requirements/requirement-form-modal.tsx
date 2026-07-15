import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Database,
  FileText,
  GitFork,
  Maximize2,
  Package,
  Paperclip,
  SignalHigh,
  UserCircle2,
  Users,
} from "lucide-react";
import { EFileAssetType, type TIssuePriorities } from "@plane/types";
import { Button } from "@plane/propel/button";
import { CloseIcon, PriorityIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProductDescriptionEditor } from "@/components/product/product-description-editor";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useRequirementTemplates } from "@/hooks/store/use-requirement-templates";
import { FileService } from "@/services/file.service";
import type {
  TRequirementAttachment,
  TRequirementModule,
  TRequirementType,
  TUserRequirementDetail,
  TUserRequirementPayload,
} from "@/services/requirement.service";
import { RequirementAttachmentsField } from "./requirement-attachments-field";
import { RequirementFullscreenEditorModal } from "./requirement-fullscreen-editor-modal";

const fileService = new FileService();
const priorities: { value: TIssuePriorities; label: string }[] = [
  { value: "urgent", label: "紧急" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
  { value: "none", label: "无" },
];

type TPropertyRowProps = {
  icon: typeof SignalHigh;
  label: string;
  children: React.ReactNode;
};

function PropertyRow(props: TPropertyRowProps) {
  const { icon: Icon, label, children } = props;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex w-[72px] shrink-0 items-center gap-1.5 text-12 text-tertiary">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function EditorFieldHeader(props: { label: string; onExpand: () => void }) {
  const { label, onExpand } = props;
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <p className="text-14 font-medium text-secondary">{label}</p>
      <button
        type="button"
        onClick={onExpand}
        className="focus-visible:ring-accent-primary/30 inline-flex items-center gap-1 rounded-md px-2 py-1 text-11 text-tertiary transition-colors hover:bg-layer-1 hover:text-primary focus-visible:ring-2 focus-visible:outline-none"
        aria-label={`全屏编辑${label}`}
        title={`全屏编辑${label}`}
      >
        <Maximize2 className="size-3.5" />
        <span>放大</span>
      </button>
    </div>
  );
}

type TFormValues = Omit<TUserRequirementPayload, "attachment_ids">;

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  productId: string;
  requirementLabel?: string;
  requirementType: TRequirementType;
  requirementId?: string;
  modules: TRequirementModule[];
  fetchRequirement: (id: string) => Promise<TUserRequirementDetail | undefined>;
  fetchParentOptions: (search?: string, exclude?: string) => Promise<{ id: string; name: string }[]>;
  onSubmit: (data: TUserRequirementPayload, submitForReview: boolean) => Promise<unknown>;
  onClose: () => void;
};

const defaultValues: TFormValues = {
  name: "",
  priority: "none",
  module: null,
  parent: null,
  assignee: null,
  reviewers: [],
  description_html: "<p></p>",
  acceptance_criteria_html: "<p></p>",
  content_mode: "text",
  template_id: null,
};

export function RequirementFormModal(props: Props) {
  const {
    fetchParentOptions,
    fetchRequirement,
    isOpen,
    modules,
    onClose,
    onSubmit,
    productId,
    requirementLabel = "用户需求",
    requirementId,
    requirementType,
    workspaceSlug,
  } = props;
  const [isInitializing, setIsInitializing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [parentOptions, setParentOptions] = useState<{ id: string; name: string }[]>([]);
  const [attachments, setAttachments] = useState<TRequirementAttachment[]>([]);
  const [uploadedAssetIds, setUploadedAssetIds] = useState<string[]>([]);
  const [expandedEditor, setExpandedEditor] = useState<"description" | "acceptance-criteria" | null>(null);
  const {
    control,
    clearErrors,
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
    setError,
    watch,
  } = useForm<TFormValues>({ defaultValues });
  const contentMode = watch("content_mode") ?? "text";
  const { fetchTemplates, templates } = useRequirementTemplates(workspaceSlug, productId);
  const { eligibleMembers, fetchMembers } = useProductMembers(workspaceSlug, productId);
  const eligibleMemberIds = useMemo(() => eligibleMembers.map((member) => member.id), [eligibleMembers]);

  useEffect(() => {
    if (isOpen) void fetchMembers().catch(() => undefined);
  }, [fetchMembers, isOpen]);

  useEffect(() => {
    if (isOpen && requirementType === "development" && !requirementId) {
      void fetchTemplates(true).catch(() => undefined);
    }
  }, [fetchTemplates, isOpen, requirementId, requirementType]);

  useEffect(() => {
    if (!isOpen) {
      setExpandedEditor(null);
      return;
    }
    let active = true;
    setIsInitializing(true);
    setLoadFailed(false);
    Promise.all([
      requirementId ? fetchRequirement(requirementId) : Promise.resolve(undefined),
      fetchParentOptions(undefined, requirementId),
    ])
      .then(([detail, options]) => {
        if (!active) return undefined;
        const pendingProposal = detail?.open_change ?? undefined;
        setParentOptions(options);
        setAttachments(pendingProposal?.attachments ?? detail?.attachments ?? []);
        reset(
          detail
            ? {
                name: pendingProposal?.name ?? detail.name,
                priority: pendingProposal?.priority ?? detail.priority,
                module: pendingProposal ? pendingProposal.module : detail.module,
                parent: pendingProposal ? pendingProposal.parent : detail.parent,
                assignee: pendingProposal ? pendingProposal.assignee : detail.assignee,
                reviewers: pendingProposal?.proposed_reviewers ?? detail.reviewers,
                description_html:
                  detail.content_mode === "structured"
                    ? null
                    : (pendingProposal?.description_html ?? detail.description_html ?? "<p></p>"),
                acceptance_criteria_html:
                  detail.content_mode === "structured"
                    ? null
                    : (pendingProposal?.acceptance_criteria_html ?? detail.acceptance_criteria_html ?? "<p></p>"),
                content_mode: detail.content_mode,
                template_id: null,
              }
            : defaultValues
        );
        return undefined;
      })
      .catch(() => {
        if (!active) return undefined;
        setToast({ type: TOAST_TYPE.ERROR, title: "加载失败", message: "无法加载需求详情，请稍后重试。" });
        setLoadFailed(true);
        return undefined;
      })
      .finally(() => active && setIsInitializing(false));
    return () => {
      active = false;
    };
  }, [fetchParentOptions, fetchRequirement, isOpen, requirementId, reset]);

  const title = requirementId ? `发起${requirementLabel}变更` : `创建${requirementLabel}`;
  const attachmentIds = useMemo(
    () => [...new Set([...attachments.map((attachment) => attachment.id), ...uploadedAssetIds])],
    [attachments, uploadedAssetIds]
  );

  const cleanupNewAssets = async () => {
    if (uploadedAssetIds.length === 0) return;
    await Promise.allSettled(
      uploadedAssetIds.map((assetId) => fileService.deleteProductAsset(workspaceSlug, productId, assetId))
    );
    setUploadedAssetIds([]);
  };

  const handleClose = async () => {
    setExpandedEditor(null);
    await cleanupNewAssets();
    setAttachments([]);
    reset(defaultValues);
    onClose();
  };

  const submitForm = async (data: TFormValues, submitForReview: boolean) => {
    if (submitForReview && data.reviewers.length === 0) {
      setError("reviewers", { message: "至少选择一名评审人" });
      return;
    }
    clearErrors("reviewers");
    const payload =
      data.content_mode === "structured"
        ? { ...data, description_html: null, acceptance_criteria_html: null }
        : data;
    try {
      await onSubmit({ ...payload, attachment_ids: attachmentIds }, submitForReview);
      setUploadedAssetIds([]);
      setAttachments([]);
      setExpandedEditor(null);
      reset(defaultValues);
      onClose();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: submitForReview ? (requirementId ? "已提交修订" : "创建成功") : "草稿已保存",
        message: submitForReview
          ? requirementId
            ? `${requirementLabel}修订已进入评审。`
            : `${requirementLabel}已创建并进入评审。`
          : `${requirementLabel}草稿已保存，可稍后继续编辑。`,
      });
    } catch (error: any) {
      if (error?.name) {
        setError("name", { message: Array.isArray(error.name) ? error.name[0] : error.name });
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: requirementId ? "保存失败" : "创建失败",
        message: error?.error ?? "请检查表单内容后重试。",
      });
    }
  };

  return (
    <>
      <ModalCore
        isOpen={isOpen}
        handleClose={() => void handleClose()}
        position={EModalPosition.TOP_EXTENDED}
        width={EModalWidth.VIXL}
        className="overflow-hidden"
      >
        <div className="flex h-[calc(100dvh-3rem)] flex-col md:h-[calc(100dvh-5rem)]">
          <div className="flex shrink-0 items-center justify-between border-b border-subtle px-5 py-4">
            <div>
              <h2 className="text-16 font-semibold text-primary">{title}</h2>
            </div>
            <button type="button" onClick={() => void handleClose()} className="rounded p-1.5 hover:bg-layer-1">
              <CloseIcon className="size-4 text-secondary" />
            </button>
          </div>

          {isInitializing ? (
            <div className="grid min-h-96 place-items-center">
              <div className="border-t-accent-primary size-7 animate-spin rounded-full border-2 border-subtle" />
            </div>
          ) : loadFailed ? (
            <div className="grid min-h-80 place-items-center p-6 text-center">
              <div>
                <p className="text-14 font-medium text-primary">无法加载需求内容</p>
                <p className="mt-1 text-12 text-secondary">关闭弹窗后重试。</p>
                <Button type="button" variant="secondary" size="lg" className="mt-4" onClick={() => void handleClose()}>
                  关闭
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit((data) => submitForm(data, data.content_mode !== "structured"))}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div
                data-modal-wheel-scroll
                className="vertical-scrollbar grid scrollbar-sm min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden"
              >
                <div className="vertical-scrollbar scrollbar-sm space-y-6 p-6 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-subtle">
                  <div>
                    <label
                      htmlFor="requirement-name"
                      className="mb-1.5 flex items-center gap-1 text-14 font-medium text-secondary"
                    >
                      需求名称
                      <span className="text-danger-primary">*</span>
                    </label>
                    <Controller
                      name="name"
                      control={control}
                      rules={{ required: "请输入需求名称", maxLength: { value: 255, message: "不能超过 255 个字符" } }}
                      render={({ field }) => (
                        <Input
                          {...field}
                          id="requirement-name"
                          hasError={!!errors.name}
                          placeholder={`用一句话概括这个${requirementLabel}`}
                          className="h-10 w-full text-14"
                        />
                      )}
                    />
                    {errors.name?.message && <p className="mt-1 text-11 text-danger-primary">{errors.name.message}</p>}
                  </div>

                  {requirementType === "development" && (
                    <div>
                      <p className="mb-2 text-14 font-medium text-secondary">内容模式</p>
                      <Controller
                        name="content_mode"
                        control={control}
                        render={({ field }) => (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {[
                              {
                                value: "text" as const,
                                label: "文本需求",
                                description: "使用需求描述和验收标准",
                                icon: FileText,
                              },
                              {
                                value: "structured" as const,
                                label: "结构化需求",
                                description: "自定义字段、多条记录与一层子表",
                                icon: Database,
                              },
                            ].map((item) => {
                              const Icon = item.icon;
                              const selected = field.value === item.value;
                              return (
                                <button
                                  key={item.value}
                                  type="button"
                                  disabled={!!requirementId}
                                  onClick={() => field.onChange(item.value)}
                                  className={cn(
                                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                                    selected
                                      ? "border-accent-primary bg-accent-primary/5"
                                      : "border-subtle bg-surface-1 hover:bg-layer-1",
                                    requirementId && "cursor-default"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "grid size-8 shrink-0 place-items-center rounded-md",
                                      selected ? "bg-accent-primary text-on-color" : "bg-layer-1 text-tertiary"
                                    )}
                                  >
                                    <Icon className="size-4" />
                                  </span>
                                  <span>
                                    <span className="block text-12 font-medium text-primary">{item.label}</span>
                                    <span className="mt-0.5 block text-10 leading-4 text-secondary">
                                      {item.description}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      />
                    </div>
                  )}

                  {contentMode === "structured" && !requirementId && (
                    <div className="rounded-lg border border-subtle bg-layer-1 p-4">
                      <label className="mb-1.5 block text-12 font-medium text-primary">需求模板（可选）</label>
                      <Controller
                        name="template_id"
                        control={control}
                        render={({ field }) => (
                          <select
                            value={field.value ?? ""}
                            onChange={(event) => field.onChange(event.target.value || null)}
                            className="h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-12 text-primary outline-none"
                          >
                            <option value="">不使用模板，创建后自行定义</option>
                            {templates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.name}（{template.field_count} 个字段）
                              </option>
                            ))}
                          </select>
                        )}
                      />
                      <p className="mt-2 text-10 leading-4 text-tertiary">
                        模板仅在创建时复制一次，之后可以在需求内独立修改字段。
                      </p>
                    </div>
                  )}

                  {contentMode === "text" && (
                    <div>
                      <EditorFieldHeader label="需求描述" onExpand={() => setExpandedEditor("description")} />
                      <Controller
                        name="description_html"
                        control={control}
                        render={({ field }) =>
                          expandedEditor === "description" ? (
                            <div className="grid min-h-52 place-items-center rounded-md border border-subtle bg-layer-2 px-4 text-center text-12 text-tertiary">
                              需求描述正在全屏编辑，退出全屏后会同步显示在这里。
                            </div>
                          ) : (
                            <ProductDescriptionEditor
                              workspaceSlug={workspaceSlug}
                              productId={productId}
                              entityIdentifier={requirementId}
                              assetEntityType={EFileAssetType.REQUIREMENT_ATTACHMENT}
                              editorId="requirement-description"
                              value={field.value}
                              editable
                              placeholder="描述用户场景、问题与期望结果"
                              minHeightClassName="min-h-52"
                              heightClassName="h-60"
                              onChange={field.onChange}
                              onAssetUpload={(assetId) => {
                                setUploadedAssetIds((current) => [...new Set([...current, assetId])]);
                              }}
                            />
                          )
                        }
                      />
                    </div>
                  )}

                  {contentMode === "text" && (
                    <div>
                      <EditorFieldHeader label="验收标准" onExpand={() => setExpandedEditor("acceptance-criteria")} />
                      <Controller
                        name="acceptance_criteria_html"
                        control={control}
                        render={({ field }) =>
                          expandedEditor === "acceptance-criteria" ? (
                            <div className="grid min-h-44 place-items-center rounded-md border border-subtle bg-layer-2 px-4 text-center text-12 text-tertiary">
                              验收标准正在全屏编辑，退出全屏后会同步显示在这里。
                            </div>
                          ) : (
                            <ProductDescriptionEditor
                              workspaceSlug={workspaceSlug}
                              productId={productId}
                              entityIdentifier={requirementId}
                              assetEntityType={EFileAssetType.REQUIREMENT_ATTACHMENT}
                              editorId="requirement-acceptance"
                              value={field.value}
                              editable
                              placeholder="列出可验证的完成条件"
                              minHeightClassName="min-h-44"
                              heightClassName="h-60"
                              onChange={field.onChange}
                              onAssetUpload={(assetId) =>
                                setUploadedAssetIds((current) => [...new Set([...current, assetId])])
                              }
                            />
                          )
                        }
                      />
                    </div>
                  )}

                  {contentMode === "structured" && (
                    <div className="border-accent-primary/20 rounded-xl border bg-accent-primary/5 px-5 py-6">
                      <Database className="size-5 text-accent-primary" />
                      <p className="mt-3 text-13 font-medium text-primary">结构化数据将在需求完整页编辑</p>
                      <p className="mt-1 text-11 leading-5 text-secondary">
                        保存基本信息后，系统会创建修订草稿，你可继续定义字段、录入主记录和子表数据，再统一提交评审。
                      </p>
                    </div>
                  )}
                </div>

                <aside className="vertical-scrollbar scrollbar-sm space-y-6 border-t border-subtle bg-layer-1/40 p-6 lg:min-h-0 lg:overflow-y-auto lg:border-t-0">
                  <div>
                    <p className="mb-1.5 text-14 font-medium text-secondary">属性</p>
                    <div className="divide-y divide-subtle/60">
                      <PropertyRow icon={SignalHigh} label="优先级">
                        <Controller
                          name="priority"
                          control={control}
                          render={({ field }) => (
                            <CustomSelect
                              value={field.value}
                              onChange={field.onChange}
                              label={
                                <span className="flex items-center gap-1.5">
                                  <PriorityIcon priority={field.value} size={12} withContainer />
                                  {priorities.find((item) => item.value === field.value)?.label ?? "无"}
                                </span>
                              }
                              buttonClassName="h-9 w-full"
                            >
                              {priorities.map((item) => (
                                <CustomSelect.Option key={item.value} value={item.value}>
                                  <span className="flex items-center gap-1.5">
                                    <PriorityIcon priority={item.value} size={12} withContainer />
                                    {item.label}
                                  </span>
                                </CustomSelect.Option>
                              ))}
                            </CustomSelect>
                          )}
                        />
                      </PropertyRow>

                      <PropertyRow icon={Package} label="模块">
                        <Controller
                          name="module"
                          control={control}
                          render={({ field }) => (
                            <CustomSelect
                              value={field.value ?? ""}
                              onChange={(value: string) => field.onChange(value || null)}
                              label={modules.find((item) => item.id === field.value)?.name ?? "未分配"}
                              buttonClassName="h-9 w-full"
                            >
                              <CustomSelect.Option value="">未分配</CustomSelect.Option>
                              {modules.map((item) => (
                                <CustomSelect.Option key={item.id} value={item.id}>
                                  {item.name}
                                </CustomSelect.Option>
                              ))}
                            </CustomSelect>
                          )}
                        />
                      </PropertyRow>

                      <PropertyRow icon={GitFork} label="父需求">
                        <Controller
                          name="parent"
                          control={control}
                          render={({ field }) => (
                            <CustomSelect
                              value={field.value ?? ""}
                              onChange={(value: string) => field.onChange(value || null)}
                              label={parentOptions.find((item) => item.id === field.value)?.name ?? "无父需求"}
                              buttonClassName="h-9 w-full"
                            >
                              <CustomSelect.Option value="">无父需求</CustomSelect.Option>
                              {parentOptions.map((item) => (
                                <CustomSelect.Option key={item.id} value={item.id}>
                                  {item.name}
                                </CustomSelect.Option>
                              ))}
                            </CustomSelect>
                          )}
                        />
                      </PropertyRow>

                      <PropertyRow icon={UserCircle2} label="负责人">
                        <Controller
                          name="assignee"
                          control={control}
                          render={({ field }) => (
                            <MemberDropdown
                              memberIds={eligibleMemberIds}
                              value={field.value ?? null}
                              onChange={field.onChange}
                              multiple={false}
                              placeholder="未分配"
                              buttonVariant="border-with-text"
                              buttonContainerClassName="w-full"
                              buttonClassName="h-9 w-full justify-start"
                            />
                          )}
                        />
                      </PropertyRow>

                      <PropertyRow icon={Users} label="评审人">
                        <Controller
                          name="reviewers"
                          control={control}
                          render={({ field }) => (
                            <MemberDropdown
                              memberIds={eligibleMemberIds}
                              value={field.value ?? []}
                              onChange={field.onChange}
                              multiple
                              placeholder="选择评审人"
                              buttonVariant="border-with-text"
                              buttonContainerClassName="w-full"
                              buttonClassName="min-h-9 w-full justify-start"
                            />
                          )}
                        />
                        {errors.reviewers?.message && (
                          <p className="mt-1 text-11 text-danger-primary">{errors.reviewers.message}</p>
                        )}
                      </PropertyRow>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-12 font-medium text-secondary">
                        <Paperclip className="size-3.5 text-tertiary" />
                        附件
                      </p>
                      <span className="text-10 text-tertiary">可选</span>
                    </div>
                    <RequirementAttachmentsField
                      workspaceSlug={workspaceSlug}
                      productId={productId}
                      requirementId={requirementId}
                      attachments={attachments}
                      onUpload={(attachment) => {
                        setAttachments((current) => [...current, attachment]);
                        setUploadedAssetIds((current) => [...new Set([...current, attachment.id])]);
                      }}
                      onRemove={(attachmentId) => {
                        setAttachments((current) => current.filter((item) => item.id !== attachmentId));
                        if (uploadedAssetIds.includes(attachmentId)) {
                          void fileService.deleteProductAsset(workspaceSlug, productId, attachmentId);
                          setUploadedAssetIds((current) => current.filter((id) => id !== attachmentId));
                        }
                      }}
                    />
                  </div>
                </aside>
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t border-subtle bg-surface-1 px-6 py-4">
                <Button type="button" variant="secondary" size="lg" onClick={() => void handleClose()}>
                  取消
                </Button>
                {contentMode === "text" && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    loading={isSubmitting}
                    onClick={() => void handleSubmit((data) => submitForm(data, false))()}
                  >
                    保存草稿
                  </Button>
                )}
                <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
                  {contentMode === "structured"
                    ? requirementId
                      ? "保存基本信息"
                      : "创建并配置数据"
                    : requirementId
                      ? "提交修订评审"
                      : "创建并发起评审"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </ModalCore>

      <Controller
        name="description_html"
        control={control}
        render={({ field }) => (
          <RequirementFullscreenEditorModal
            isOpen={isOpen && expandedEditor === "description"}
            kind="description"
            workspaceSlug={workspaceSlug}
            productId={productId}
            requirementId={requirementId}
            value={field.value}
            onChange={field.onChange}
            onAssetUpload={(assetId) => setUploadedAssetIds((current) => [...new Set([...current, assetId])])}
            onClose={() => setExpandedEditor(null)}
          />
        )}
      />

      <Controller
        name="acceptance_criteria_html"
        control={control}
        render={({ field }) => (
          <RequirementFullscreenEditorModal
            isOpen={isOpen && expandedEditor === "acceptance-criteria"}
            kind="acceptance-criteria"
            workspaceSlug={workspaceSlug}
            productId={productId}
            requirementId={requirementId}
            value={field.value}
            onChange={field.onChange}
            onAssetUpload={(assetId) => setUploadedAssetIds((current) => [...new Set([...current, assetId])])}
            onClose={() => setExpandedEditor(null)}
          />
        )}
      />
    </>
  );
}
