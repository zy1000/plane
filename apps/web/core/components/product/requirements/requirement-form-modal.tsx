import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { GitFork, Maximize2, Package, Paperclip, SignalHigh, UserCircle2, Users } from "lucide-react";
import { EFileAssetType, type TIssuePriorities } from "@plane/types";
import { Button } from "@plane/propel/button";
import { CloseIcon, PriorityIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProductDescriptionEditor } from "@/components/product/product-description-editor";
import { FileService } from "@/services/file.service";
import type {
  TRequirementAttachment,
  TRequirementModule,
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
  requirementId?: string;
  modules: TRequirementModule[];
  fetchRequirement: (id: string) => Promise<TUserRequirementDetail | undefined>;
  fetchParentOptions: (search?: string, exclude?: string) => Promise<{ id: string; name: string }[]>;
  onSubmit: (data: TUserRequirementPayload) => Promise<unknown>;
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
    requirementId,
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
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
    setError,
  } = useForm<TFormValues>({ defaultValues });

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
        setParentOptions(options);
        setAttachments(detail?.attachments ?? []);
        reset(
          detail
            ? {
                name: detail.name,
                priority: detail.priority,
                module: detail.module,
                parent: detail.parent,
                assignee: detail.assignee,
                reviewers: detail.reviewers,
                description_html: detail.description_html ?? "<p></p>",
                acceptance_criteria_html: detail.acceptance_criteria_html ?? "<p></p>",
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

  const title = requirementId ? "编辑用户需求" : "创建用户需求";
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

  const submitForm = async (data: TFormValues) => {
    try {
      await onSubmit({ ...data, attachment_ids: attachmentIds });
      setUploadedAssetIds([]);
      setAttachments([]);
      setExpandedEditor(null);
      reset(defaultValues);
      onClose();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: requirementId ? "保存成功" : "创建成功",
        message: requirementId ? "用户需求已更新。" : "用户需求已加入列表。",
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
            <form onSubmit={handleSubmit(submitForm)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                          placeholder="用一句话概括这个用户需求"
                          className="h-10 w-full text-14"
                        />
                      )}
                    />
                    {errors.name?.message && <p className="mt-1 text-11 text-danger-primary">{errors.name.message}</p>}
                  </div>

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
                <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
                  {requirementId ? "保存需求" : "创建需求"}
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
