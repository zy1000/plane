"use client";

import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { CornerDownRight, GitBranch, Lock, Trash2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirement,
  TRequirementAssetRef,
  TRequirementBuiltinFieldConfig,
  TRequirementBuiltinKey,
  TRequirementItemStatus,
  TRequirementTrailEntry,
  TRequirementData,
  TRequirementField,
  TRequirementTypeSchema,
} from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { cn } from "@plane/utils";
import {
  BuiltinCellEditor,
  BuiltinCellValue,
  REQUIREMENT_BUILTIN_COLUMNS,
} from "@/components/requirements/requirement-builtin-fields";
import { resolveBuiltinLayout } from "@/components/requirements/requirement-builtin-layout";
import { RequirementModuleDropdown } from "@/components/requirements/module-tree/requirement-module-dropdown";
import { LeafEditor, LeafValue } from "@/components/requirements/requirement-grid-shared";
import { RequirementCodeInput } from "@/components/requirements/requirement-code-input";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { RequirementStatusCell } from "@/components/requirements/requirement-status-cell";
import {
  isBlankRequirementDescription,
  RequirementRichTextEditor,
  RequirementRichTextValue,
} from "@/components/requirements/requirement-rich-text";
import { REQUIREMENT_APPROVAL_PILL } from "@/components/products/requirements/approval/requirement-approval-cell";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useMember } from "@/hooks/store/use-member";
import { RequirementAttachmentsSection } from "./requirement-attachments-section";
import { DetailSectionHeader } from "./requirement-detail-section";
import { RequirementFieldsSection } from "./requirement-fields-section";
import { RequirementHistorySection } from "./requirement-history-section";
import { RequirementInReviewBanner } from "./requirement-in-review-banner";
import { RequirementModifiedBanner } from "./requirement-modified-banner";
import { RequirementProjectsSelect } from "./requirement-projects-select";
import { RequirementPropertyBar } from "./requirement-property-bar";
import { RequirementSubformSection } from "./requirement-subform-section";
import type { TRequirementDetailPatch } from "./use-requirement-detail";

/**
 * 标题与描述在主区自成一段，其余六个内置列走属性区（抽屉的属性条 / 整页的右栏）。
 * 这是拿不到类型布局时的回退顺序；整页右栏按类型布局重排（见 RequirementDetailProperties）。
 */
const PROPERTY_COLUMN_KEYS: TRequirementBuiltinKey[] = [
  "status",
  "priority",
  "assignee_id",
  "start_date",
  "target_date",
  "parent_id",
];

type TPatch = TRequirementDetailPatch;

type TParentScope = { workspaceSlug: string; productId?: string; libraryId?: string };

type TProps = {
  workspaceSlug: string;
  /** 产品需求详情；与 libraryId 二选一 */
  productId?: string;
  /** 标准库条目详情 */
  libraryId?: string;
  requirement: TRequirement;
  requirementType: TRequirementTypeSchema | null;
  subRequirements: TRequirement[];
  trail: TRequirementTrailEntry[];
  readOnly: boolean;
  /** 基线快照抽屉关掉变更轨迹和版本历史，避免再去打活接口 */
  showHistory?: boolean;
  /** drawer 把属性排成属性条，page 把它交给右栏渲染 */
  layout: "drawer" | "page";
  resolveParentTitle?: (parentId: string) => string | undefined;
  onPatch: (patch: TPatch) => Promise<unknown>;
  /**
   * 改需求级交付状态。走独立的状态端点、不经 onPatch；不传则状态格只读。
   * 刻意与 readOnly 解耦：readOnly 是内容级（评审中 / 已关闭都为 true），而 closed
   * 行必须还能把状态选回去（重开），所以由调用方按页面级写权限决定传不传。
   */
  onStatusChange?: (status: TRequirementItemStatus) => void;
  /**
   * 改模块挂靠。走 set-module 旁路端点、不经 onPatch；不传则模块只读。
   * 与 onStatusChange 同理和 readOnly 解耦 —— 模块不是内容，评审中 / 已关闭
   * 都能改，由调用方按页面级写权限决定传不传。产品与标准库两侧都可用。
   */
  onModuleChange?: (moduleId: string | null, moduleName: string | null) => void;
  onOpenRequirement: (requirementId: string) => void;
  /** 回滚写的是活行而不是版本链，所以要让调用方重新拉一次这一行 */
  onRolledBack?: () => void;
  /**
   * 「关联工作项」区块，由调用方按侧别注入：项目侧抽屉给可操作的 Section（拆分/
   * 关联/解除），产品侧整页给按项目分组的只读变体。这里不自己挂 —— 两个变体需要的
   * 作用域（projectId、link 管理权限、linked_cycle_ids 注解）都长在调用方的行数据上。
   */
  issuesSection?: React.ReactNode;
  /**
   * 「关联测试用例」区块，同样由调用方注入。与 issuesSection 不同的是它是**需求级**的
   * （关联行不带 project，用例的作用域来自 repository 且可空），所以产品侧整页、产品侧
   * 抽屉、项目侧抽屉都给可写变体 —— 项目侧走后端的第二道权限门。迭代 / 发布的范围抽屉
   * 不传：那两处是纯范围清单，连关联工作项都不显示。
   */
  testCasesSection?: React.ReactNode;
  /**
   * 整页标题行右侧的动作（提交 / 撤回评审、复制链接）。抽屉自己有顶部工具条，不用这个。
   */
  headerActions?: React.ReactNode;
  /**
   * 整页把子需求 / 关联工作项 / 关联测试用例交给调用方（操作条 + 有内容才出的折叠块）。
   * 传了就替换掉这里自带的子需求区块和 issuesSection / testCasesSection 三段竖排。
   */
  relationsSection?: React.ReactNode;
  /**
   * 抽屉横幅上的审批动作：提交评审（变更中）、查看变更单 / 撤回评审（评审中）。
   * 弹窗与提交逻辑长在列表页上，这里只放入口；项目侧 / 范围抽屉不传则横幅只出说明。
   * 整页不用这几个 —— 标题行右侧的 RequirementApprovalPanel 已经承担。
   */
  onSubmitReview?: () => void;
  onWithdrawReview?: (changeRequestId: string) => void;
  onOpenChangeRequest?: (changeRequestId: string) => void;
  isApprovalMutating?: boolean;
};

/** 整页字段网格里独占一整行的字段类型：富文本、附件、图片展开后都比一格宽 */
const WIDE_FIELD_TYPES = new Set<string>(["rich_text", "attachment", "image"]);

/**
 * 整页的叶子字段（非 form）网格：标签在上、值在下，三列铺开，宽字段独占一行 ——
 * 版面宽，两列排会空掉一大半。抽屉走 RequirementFieldsSection（标签左、值右的两列）。
 */
const FieldRows = ({
  fields,
  requirement,
  workspaceSlug,
  readOnly,
  onChange,
  onUpload,
}: {
  fields: TRequirementField[];
  requirement: TRequirement;
  workspaceSlug: string;
  readOnly: boolean;
  onChange: (data: TRequirementData) => void;
  onUpload: (file: globalThis.File, imageOnly: boolean) => Promise<TRequirementAssetRef>;
}) => {
  // 版面够宽，富文本字段直接内联完整编辑器、只读时也渲染真实排版（variant="detail"）
  const renderValue = (field: TRequirementField) =>
    readOnly ? (
      <LeafValue field={field} value={requirement.data[field.id]} workspaceSlug={workspaceSlug} variant="detail" />
    ) : (
      <LeafEditor
        field={field}
        value={requirement.data[field.id]}
        workspaceSlug={workspaceSlug}
        entityId={requirement.id}
        onChange={(value) => onChange({ ...requirement.data, [field.id]: value })}
        onUpload={onUpload}
        variant="detail"
      />
    );
  const renderLabel = (field: TRequirementField, className: string) => (
    <span className={className}>
      {field.name}
      {field.is_required && <span className="ml-0.5 text-danger-primary">*</span>}
    </span>
  );

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
      {fields.map((field) => (
        <div
          key={field.id}
          className={cn(
            "flex min-w-0 flex-col gap-1",
            WIDE_FIELD_TYPES.has(field.field_type) && "md:col-span-2 xl:col-span-3"
          )}
        >
          {renderLabel(field, "text-caption-md-regular text-tertiary")}
          <div className="min-w-0">{renderValue(field)}</div>
        </div>
      ))}
    </div>
  );
};

/**
 * 子需求列表：编号 + 标题 + 状态 / 负责人，一个外框 + 分隔线而不是 N 张小卡片。
 * framed=false 给整页的关联 Tab 卡片用 —— 卡片自己已经有外框。
 */
export const RequirementSubRequirementList = ({
  items,
  isLibrary = false,
  framed = true,
  onOpen,
}: {
  items: TRequirement[];
  isLibrary?: boolean;
  framed?: boolean;
  onOpen: (requirementId: string) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className={cn("divide-y divide-subtle", framed && "overflow-hidden rounded-md border border-subtle")}>
      {items.map((child) => (
        <button
          key={child.id}
          type="button"
          onClick={() => onOpen(child.id)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-body-xs-medium transition-colors hover:bg-layer-1"
        >
          {!isLibrary && (
            <span className="shrink-0">
              <BuiltinCellValue columnKey="status" values={child} />
            </span>
          )}
          <span className="shrink-0">
            <RequirementIdentifier displayId={child.display_id} size="xs" />
          </span>
          <span className="min-w-0 flex-1 truncate text-primary">{child.title || t("requirement_detail.untitled")}</span>
          {!isLibrary && (
            <span className="shrink-0">
              <BuiltinCellValue columnKey="assignee_id" values={child} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

/**
 * 编号旁的审批徽标：只有状态胶囊。
 *
 * 这是详情页第一个要回答的问题 —— 我看到的这些值，是不是评审通过的那一版。已通过的版本号
 * 不在这里重复：变更中由横幅说、版本历史里标「当前」，同一个 v2 在头部再出现一次只会
 * 让人分不清哪个才是重点。动作按钮也不在这里（在横幅 / RequirementApprovalPanel）。
 */
const RequirementApprovalBadge = ({ requirement }: { requirement: TRequirement }) => {
  const { t } = useTranslation();
  const state = requirement.approval_state;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-caption-sm-medium",
        REQUIREMENT_APPROVAL_PILL[state]
      )}
    >
      {state === "pending_deletion" ? (
        <Trash2 className="size-3" />
      ) : state === "in_review" ? (
        <Lock className="size-3" />
      ) : (
        <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      )}
      {t(`requirement_approval.state.${state}`)}
    </span>
  );
};

/** 头部编号旁的需求类型 chip：图标 + 名称。它是这条需求的身份，下面字段区的字段就来自它 */
const RequirementTypeChip = ({ requirementType }: { requirementType: TRequirementTypeSchema | null }) => {
  if (!requirementType) return null;
  return (
    <span
      className="inline-flex h-6 max-w-56 shrink-0 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 pr-2 pl-1 text-caption-sm-medium text-secondary"
      title={requirementType.name}
    >
      <TypeIcon iconProps={requirementType.logo_props?.icon} className="size-4 rounded-sm" iconClassName="size-3" />
      <span className="truncate">{requirementType.name}</span>
    </span>
  );
};

const SectionHeading = ({ label }: { label: string }) => (
  <div className="text-body-sm-semibold text-primary">{label}</div>
);

/** 一个区块：标题与内容贴紧，区块之间靠外层的 gap 拉开 */
const Section = ({ label, children }: { label?: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2.5">
    {label && <SectionHeading label={label} />}
    {children}
  </section>
);

/**
 * 内置属性的标签/值网格，只服务整页右栏（抽屉里是 RequirementPropertyBar 属性条）。
 */
const PropertyGrid = ({
  requirement,
  readOnly,
  parentScope,
  resolveParentTitle,
  onPatch,
  onStatusChange,
  onModuleChange,
  leadingRow,
  propertyColumnKeys = PROPERTY_COLUMN_KEYS,
}: {
  requirement: TRequirement;
  readOnly: boolean;
  parentScope: TParentScope;
  resolveParentTitle?: (parentId: string) => string | undefined;
  onPatch: (patch: TPatch) => Promise<unknown>;
  onStatusChange?: (status: TRequirementItemStatus) => void;
  /** 改模块挂靠（set-module 旁路，不经 onPatch）；不传则模块行只读 */
  onModuleChange?: (moduleId: string | null, moduleName: string | null) => void;
  leadingRow?: { label: string; value: React.ReactNode };
  /** 属性行顺序（按类型布局解析后的键序）；不传回退 PROPERTY_COLUMN_KEYS */
  propertyColumnKeys?: TRequirementBuiltinKey[];
}) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[minmax(4rem,auto)_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5">
      {leadingRow && (
        <>
          <span className="text-body-xs-regular text-tertiary">{leadingRow.label}</span>
          <span className="min-w-0 truncate text-body-xs-medium text-primary">{leadingRow.value}</span>
        </>
      )}
      {/* 模块：与状态同为旁路轴，走 set-module 而不是 onPatch，所以不看 readOnly ——
          能不能改只看 onModuleChange 传没传（页面级写权限） */}
      <span className="text-body-xs-regular text-tertiary">{t("requirement_modules.column")}</span>
      {onModuleChange ? (
        <div className="min-w-0">
          <RequirementModuleDropdown
            workspaceSlug={parentScope.workspaceSlug}
            productId={parentScope.productId}
            libraryId={parentScope.libraryId}
            value={requirement.module_id}
            valueName={requirement.module_name}
            onChange={onModuleChange}
            placeholder="—"
            buttonClassName="h-7 rounded -ml-2 px-2 hover:bg-layer-transparent-hover"
            buttonTextClassName="text-body-xs-medium"
          />
        </div>
      ) : (
        <span
          className={cn(
            "min-w-0 truncate text-body-xs-medium",
            requirement.module_name ? "text-primary" : "text-placeholder"
          )}
          title={requirement.module_name ?? undefined}
        >
          {requirement.module_name ?? "—"}
        </span>
      )}
      {propertyColumnKeys.map((columnKey) => {
        const column = REQUIREMENT_BUILTIN_COLUMNS.find((item) => item.key === columnKey);
        if (!column) return null;
        return (
          <div key={columnKey} className="contents">
            <span className="text-body-xs-regular text-tertiary">{t(column.labelKey)}</span>
            <div className="min-w-0">
              {columnKey === "status" ? (
                /*
                 * 状态格白名单：绕开 readOnly（内容级只读）。closed 行内容只读但状态要能
                 * 选回去重开，评审中也能改状态 —— 能不能改只看 onStatusChange 传没传。
                 */
                <RequirementStatusCell status={requirement.status} onChange={onStatusChange} />
              ) : readOnly ? (
                <BuiltinCellValue columnKey={columnKey} values={requirement} resolveParentTitle={resolveParentTitle} />
              ) : (
                <BuiltinCellEditor
                  columnKey={columnKey}
                  values={requirement}
                  onChange={(patch) => void onPatch({ builtin: patch })}
                  parentScope={parentScope}
                  rowId={requirement.id}
                  variant="detail"
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * 一条需求的详情主体。抽屉与整页共用，差别只在 layout：
 * 抽屉把内置属性排成一行属性条压在标题下（见 RequirementPropertyBar），
 * 整页把它们交给右栏（见 RequirementDetailProperties）。
 */
export const RequirementDetailContent = (props: TProps) => {
  const {
    workspaceSlug,
    productId,
    libraryId,
    requirement,
    requirementType,
    subRequirements,
    trail,
    readOnly,
    showHistory = true,
    layout,
    resolveParentTitle,
    onPatch,
    onStatusChange,
    onModuleChange,
    onOpenRequirement,
    onRolledBack,
    issuesSection,
    testCasesSection,
    headerActions,
    relationsSection,
    onSubmitReview,
    onWithdrawReview,
    onOpenChangeRequest,
    isApprovalMutating,
  } = props;
  const { t } = useTranslation();
  const { uploadEditorAsset } = useEditorAsset();
  // 文本类先落本地、失焦再提交：每敲一个字打一次 PATCH 既慢又会把 version 打乱。
  // 描述与富文本字段把这套约定收进了 RequirementRichTextEditor 内部。
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  const isLibrary = Boolean(libraryId) && !productId;
  const scopeEntityId = productId ?? libraryId ?? "";

  const uploadAsset = useCallback(
    async (file: globalThis.File, imageOnly: boolean) => {
      if (imageOnly && !file.type.startsWith("image/")) throw new Error("Only images are supported.");
      const response = await uploadEditorAsset({
        blockId: uuidv4(),
        data: { entity_identifier: scopeEntityId, entity_type: EFileAssetType.REQUIREMENT_ATTACHMENT },
        file,
        workspaceSlug,
      });
      return { asset_id: response.asset_id, name: file.name, type: file.type, size: file.size };
    },
    [scopeEntityId, uploadEditorAsset, workspaceSlug]
  );

  const activeFields = useMemo(
    () => (requirementType?.fields ?? []).filter((field) => field.is_active),
    [requirementType]
  );
  // 叶子字段按模板顺序排成单一字段流。show_in_library 是模板编辑器的管理概念，
  // 详情页按它分区只会让用户猜「这个字段为什么归在这一组」。
  const leafFields = useMemo(() => activeFields.filter((field) => field.field_type !== "form"), [activeFields]);
  const formFields = useMemo(() => activeFields.filter((field) => field.field_type === "form"), [activeFields]);

  const parentScope = useMemo(() => ({ workspaceSlug, productId, libraryId }), [libraryId, productId, workspaceSlug]);
  const commitData = (data: TRequirementData) => void onPatch({ data });

  const isDrawer = layout === "drawer";
  const approvalBadge = !isLibrary ? <RequirementApprovalBadge requirement={requirement} /> : null;
  const descriptionBlank = isBlankRequirementDescription(requirement.description_html, requirement.title);

  const parentLink = requirement.parent_id ? (
    <button
      type="button"
      onClick={() => onOpenRequirement(requirement.parent_id as string)}
      className="flex min-w-0 max-w-full items-center gap-1.5 self-start text-caption-sm-regular text-tertiary transition-colors hover:text-primary"
    >
      <CornerDownRight className="size-3 shrink-0 rotate-180" />
      <span className="truncate">
        {resolveParentTitle?.(requirement.parent_id) ?? t("requirement_fields.builtin.parent_unresolved")}
      </span>
    </button>
  ) : null;

  // 整页时抽屉那条 bar 不存在，编号在这里出场；抽屉里两处都显示也不冲突 ——
  // 标题上方这一行是编号唯一固定的位置
  const identifier =
    isLibrary && !readOnly ? (
      // 库条目编号手填可改：blur/回车提交（空值还原不发请求），
      // 重复由服务端查重后经 submitPatch 的错误 toast 报出
      <RequirementCodeInput
        value={requirement.code ?? ""}
        onCommit={(code) => void onPatch({ code })}
        className="-mx-1 w-full max-w-60 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-caption-sm-medium text-tertiary outline-none placeholder:text-placeholder hover:border-subtle focus:border-accent-primary focus:bg-surface-1"
        placeholder={t("requirements.identifier.code_placeholder")}
      />
    ) : (
      <RequirementIdentifier
        displayId={requirement.display_id}
        sourceDisplayId={requirement.source_display_id}
        size="sm"
        enableClickToCopy
      />
    );

  return (
    <div className="flex flex-col gap-7 text-body-sm-regular">
      <header className="flex flex-col gap-2">
        {/* 整页：标题组靠左、动作靠右同一行；抽屉没有 headerActions，保持竖排 */}
        <div className={cn(!isDrawer && "flex items-start gap-4")}>
          <div className={cn("flex flex-col gap-2", !isDrawer && "min-w-0 flex-1")}>
            {isDrawer ? (
              <>
                {parentLink}
                {/* 身份行：类型 + 编号（+ 标准库来源）靠左，审批态靠右 —— 一行说清「这是什么、现在什么状态」 */}
                <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                  <RequirementTypeChip requirementType={requirementType} />
                  {identifier}
                  <span className="min-w-2 flex-1" />
                  {approvalBadge}
                </div>
              </>
            ) : (
              // 整页把父需求、编号、审批态收成一行，标题上方只占一行高度
              <div className="mb-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                {parentLink && (
                  <>
                    {parentLink}
                    <span aria-hidden className="h-3 border-l border-strong" />
                  </>
                )}
                <div className="flex min-w-0 items-center gap-2">
                  {identifier}
                  {approvalBadge}
                </div>
              </div>
            )}

            {readOnly ? (
              <h1
                className={cn(
                  "font-medium text-balance text-primary",
                  isDrawer ? "text-20 leading-snug" : "text-24 leading-tight"
                )}
              >
                {requirement.title || t("requirement_detail.untitled")}
              </h1>
            ) : (
              <input
                value={titleDraft ?? requirement.title}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => {
                  if (titleDraft !== null && titleDraft !== requirement.title)
                    void onPatch({ builtin: { title: titleDraft } });
                  setTitleDraft(null);
                }}
                maxLength={255}
                placeholder={t("requirement_detail.untitled")}
                className={cn(
                  "-mx-2 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-0.5 font-medium text-primary",
                  "focus:border-accent-primary outline-none placeholder:text-placeholder hover:border-subtle focus:bg-surface-1",
                  isDrawer ? "text-20 leading-snug" : "text-24 leading-tight"
                )}
              />
            )}
          </div>

          {!isDrawer && headerActions && (
            <div className="flex shrink-0 items-center gap-2 pt-0.5">{headerActions}</div>
          )}
        </div>

        {/* 已通过后又改过时，把「你看的不是已通过的那一版」直接说出来，并给出查看差异与
            放弃改动两个出口 —— 这两件事用户过去在系统里都找不到。标准库不走审批，没有这层。 */}
        {!isLibrary && productId && (
          <RequirementModifiedBanner
            workspaceSlug={workspaceSlug}
            productId={productId}
            requirement={requirement}
            requirementTypeName={requirementType?.name ?? ""}
            fields={activeFields}
            builtinLayout={requirementType?.builtin_fields ?? null}
            readOnly={readOnly}
            onDiscarded={onRolledBack}
            onSubmitReview={isDrawer ? onSubmitReview : undefined}
          />
        )}

        {/* 评审中 / 删除待审：只读不是没权限，把原因和出口说出来。整页由标题行的审批面板承担 */}
        {isDrawer && !isLibrary && productId && (
          <RequirementInReviewBanner
            requirement={requirement}
            isMutating={isApprovalMutating}
            onOpenChangeRequest={onOpenChangeRequest}
            onWithdrawReview={onWithdrawReview}
          />
        )}

        {/* 抽屉没有右栏，属性条压在标题下、描述之上 —— 与工作项 peek 的属性条同位；
            整页交给右栏（见 RequirementDetailProperties） */}
        {isDrawer && (
          <RequirementPropertyBar
            requirement={requirement}
            readOnly={readOnly}
            parentScope={parentScope}
            onPatch={onPatch}
            onStatusChange={onStatusChange}
            onModuleChange={onModuleChange}
          />
        )}

        {/* 描述紧跟标题，不给它单独的小标题 —— 位置已经说明了它是什么。
            抽屉里限宽到 42rem，正文行长超过这个数就开始需要用手指指着读了；
            整页跟主列一样铺满 —— 主列本身已经封顶（见 requirement-detail-page），不再二次限宽 */}
        <div className={cn(isDrawer && "max-w-[42rem]")}>
          {readOnly ? (
            descriptionBlank ? (
              <p className="text-body-sm-regular text-placeholder">{t("requirement_detail.no_description")}</p>
            ) : (
              <RequirementRichTextValue
                workspaceSlug={workspaceSlug}
                editorId={`requirement-description-${requirement.id}`}
                value={requirement.description_html}
                containerClassName="-ml-3 border-none"
              />
            )
          ) : (
            <RequirementRichTextEditor
              workspaceSlug={workspaceSlug}
              entityId={requirement.id}
              editorId={`requirement-description-${requirement.id}`}
              value={descriptionBlank ? "" : (requirement.description_html ?? "")}
              onChange={(html) => {
                if (descriptionBlank && isBlankRequirementDescription(html, requirement.title)) return;
                void onPatch({ builtin: { description_html: html } });
              }}
              placeholder={t("requirement_detail.add_description")}
              containerClassName="-ml-3 min-h-8 border-none"
            />
          )}
        </div>
      </header>

      {isDrawer ? (
        // 抽屉：叶子字段与子表单收进同一个「字段」区块，标题写明来自哪个需求类型
        <RequirementFieldsSection
          workspaceSlug={workspaceSlug}
          requirement={requirement}
          requirementType={requirementType}
          leafFields={leafFields}
          formFields={formFields}
          readOnly={readOnly}
          onChange={commitData}
          onUpload={uploadAsset}
        />
      ) : (
        <>
          {leafFields.length > 0 && (
            // 整页的字段网格与描述之间要有个标题隔开，否则三列小字会像描述的尾巴
            <Section label={t("requirement_detail.custom_fields")}>
              <FieldRows
                fields={leafFields}
                requirement={requirement}
                workspaceSlug={workspaceSlug}
                readOnly={readOnly}
                onChange={commitData}
                onUpload={uploadAsset}
              />
            </Section>
          )}

          {formFields.length > 0 && (
            <RequirementSubformSection
              forms={formFields}
              data={requirement.data}
              workspaceSlug={workspaceSlug}
              entityId={requirement.id}
              readOnly={readOnly}
              defaultOpenCount={2}
              defaultOpenEmpty={!readOnly}
              storageKey={`requirement:subforms:${requirement.requirement_type_id}`}
              onChange={commitData}
              onUpload={uploadAsset}
            />
          )}
        </>
      )}

      {relationsSection ? (
        relationsSection
      ) : (
        <>
          {subRequirements.length > 0 &&
            (isDrawer ? (
              <section className="flex flex-col gap-2">
                <DetailSectionHeader
                  icon={GitBranch}
                  title={t("requirement_detail.sub_requirements")}
                  meta={<span className="tabular-nums">{subRequirements.length}</span>}
                />
                <RequirementSubRequirementList
                  items={subRequirements}
                  isLibrary={isLibrary}
                  framed={false}
                  onOpen={onOpenRequirement}
                />
              </section>
            ) : (
              <Section label={t("requirement_detail.sub_requirements")}>
                <RequirementSubRequirementList
                  items={subRequirements}
                  isLibrary={isLibrary}
                  onOpen={onOpenRequirement}
                />
              </Section>
            ))}

          {/* 关联工作项与子需求并列 —— 都在回答「这条需求现在被拆成了什么」 */}
          {issuesSection}

          {/* 关联测试用例紧跟其后 —— 回答「这条需求怎么验」，和「被拆成什么」是一组 */}
          {testCasesSection}
        </>
      )}

      {/*
        需求级附件：产品需求与库条目都有，放在关联区之后、历史区之前。
        附件算内容（走 onPatch 进版本快照与评审），所以读写直接跟 readOnly。
      */}
      <RequirementAttachmentsSection
        workspaceSlug={workspaceSlug}
        entityId={scopeEntityId}
        entityKind={isLibrary ? "library" : "product"}
        requirementId={requirement.id}
        attachments={requirement.attachments ?? []}
        readOnly={readOnly}
        onChange={(updater) => void onPatch({ attachments: updater })}
      />

      {/*
        历史区：轨迹含待审与被驳回的改动，版本只有通过审批的那些。
        整页和抽屉同一套：一个区块两个页签，默认停在轨迹。
      */}
      {showHistory && !isLibrary && productId && (
        <RequirementHistorySection
          workspaceSlug={workspaceSlug}
          productId={productId}
          requirementId={requirement.id}
          requirementType={requirementType}
          trail={trail}
          approvedVersion={requirement.approved_version}
          canRollback={!readOnly}
          onRolledBack={onRolledBack}
        />
      )}
    </div>
  );
};

/** 右栏的一组：小标题 + 内容，组与组之间用分隔线，最后一组不带 */
const RailGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-3 border-b border-subtle pb-5 last:border-b-0 last:pb-0">
    <span className="text-caption-md-medium text-tertiary">{label}</span>
    {children}
  </section>
);

/** 整页右栏：属性（六个内置列竖排，按类型布局排序）/ 所属项目 / 元信息 三组 */
export const RequirementDetailProperties = observer(function RequirementDetailProperties({
  requirement,
  requirementTypeName,
  builtinLayout = null,
  readOnly,
  canEdit,
  workspaceSlug,
  productId,
  libraryId,
  resolveParentTitle,
  onPatch,
  onStatusChange,
  onModuleChange,
  onProjectsChanged,
}: {
  requirement: TRequirement;
  requirementTypeName: string | null;
  /** 该需求类型的内置字段布局；null 回退 PROPERTY_COLUMN_KEYS 的现状顺序 */
  builtinLayout?: TRequirementBuiltinFieldConfig[] | null;
  /** 内容级只读：无写权限 / 评审中 / 已关闭 都为 true，管 PropertyGrid 里的内容列 */
  readOnly: boolean;
  /**
   * 页面级写权限，管「所属项目」多选：它写的是关联表而不是需求内容，closed / is_locked
   * 都不禁用它 —— 解除关联仍允许，往 closed 行上新增关联由后端 409。
   */
  canEdit: boolean;
  workspaceSlug: string;
  /** 产品需求详情；与 libraryId 二选一 */
  productId?: string;
  /**
   * 标准库条目详情：没有交付状态、审批与所属项目，属性行按类型布局的 show_in_library
   * 过滤（与库网格的列一致）。
   */
  libraryId?: string;
  resolveParentTitle?: (parentId: string) => string | undefined;
  onPatch: (patch: TPatch) => Promise<unknown>;
  /** 改需求级交付状态；不传则状态格只读（见 RequirementDetailContent 同名 prop） */
  onStatusChange?: (status: TRequirementItemStatus) => void;
  /** 改模块挂靠（set-module 旁路）；不传则模块行只读（见 RequirementDetailContent 同名 prop） */
  onModuleChange?: (moduleId: string | null, moduleName: string | null) => void;
  /** project_ids 是服务端注解的，改完必须重新拉这一行才能回显 */
  onProjectsChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const isLibrary = Boolean(libraryId) && !productId;
  const parentScope = useMemo(() => ({ workspaceSlug, productId, libraryId }), [libraryId, productId, workspaceSlug]);
  const creatorName = requirement.created_by ? getUserDetails(requirement.created_by)?.display_name : undefined;
  const updaterName = requirement.updated_by ? getUserDetails(requirement.updated_by)?.display_name : undefined;
  // 属性行顺序跟类型布局走（描述在主区，不进属性行）；拿不到布局时解析层回退现状顺序。
  // 库条目只出 show_in_library 的列 —— 状态 / 负责人这些产品侧的轴在库里不存在
  const propertyColumnKeys = useMemo(
    () =>
      resolveBuiltinLayout(builtinLayout)
        .filter((entry) => entry.key !== "description_html" && (!isLibrary || entry.show_in_library))
        .map((entry) => entry.key as TRequirementBuiltinKey),
    [builtinLayout, isLibrary]
  );

  return (
    <div className="flex flex-col gap-5">
      <RailGroup label={t("requirement_detail.properties")}>
        <PropertyGrid
          requirement={requirement}
          readOnly={readOnly}
          parentScope={parentScope}
          resolveParentTitle={resolveParentTitle}
          onPatch={onPatch}
          onStatusChange={onStatusChange}
          onModuleChange={onModuleChange}
          propertyColumnKeys={propertyColumnKeys}
          leadingRow={{
            label: t("requirement_detail.requirement_type"),
            value: requirementTypeName ?? "—",
          }}
        />
      </RailGroup>

      {/*
        所属项目：这条需求进了哪些项目（RequirementProject）。它不是需求的内容字段，
        所以不进 PropertyGrid —— 那一栅格里的每一项都会走 onPatch 写回需求本体，而
        这里写的是关联表。
      */}
      {!isLibrary && productId && (
        <RailGroup label={t("requirement_detail.projects.label")}>
          <RequirementProjectsSelect
            workspaceSlug={workspaceSlug}
            productId={productId}
            requirement={requirement}
            readOnly={!canEdit}
            onChanged={onProjectsChanged}
          />
        </RailGroup>
      )}

      {/* 创建 / 更新人按工作区成员表解析；解析不到（已离开工作区）只留日期 */}
      <RailGroup label={t("requirement_detail.meta.label")}>
        <div className="flex flex-col gap-1.5 text-caption-md-regular text-tertiary">
          <span>
            {t("requirement_detail.meta.created_at", { date: requirement.created_at?.slice(0, 10) ?? "—" })}
            {creatorName ? ` · ${creatorName}` : ""}
          </span>
          <span>
            {t("requirement_detail.meta.updated_at", { date: requirement.updated_at?.slice(0, 10) ?? "—" })}
            {updaterName ? ` · ${updaterName}` : ""}
          </span>
          {!isLibrary && requirement.approved_version !== null && (
            <span>{t("requirement_approval.approved_version", { version: requirement.approved_version })}</span>
          )}
        </div>
      </RailGroup>
    </div>
  );
});
