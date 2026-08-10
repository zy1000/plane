"use client";

import { useCallback, useMemo, useState } from "react";
import { CornerDownRight, Lock, Trash2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirement,
  TRequirementAssetRef,
  TRequirementBuiltinKey,
  TRequirementBuiltinValues,
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
  shouldShowRequirementStatus,
} from "@/components/requirements/requirement-builtin-fields";
import { LeafEditor, LeafValue } from "@/components/requirements/requirement-grid-shared";
import {
  RequirementRichTextEditor,
  RequirementRichTextValue,
} from "@/components/requirements/requirement-rich-text";
import { REQUIREMENT_APPROVAL_PILL } from "@/components/products/requirements/approval/requirement-approval-cell";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { RequirementChangeTrail } from "./requirement-change-trail";
import { RequirementModifiedBanner } from "./requirement-modified-banner";
import { RequirementPropertyBar } from "./requirement-property-bar";
import { RequirementSubformSection } from "./requirement-subform-section";
import { RequirementVersionHistory } from "./requirement-version-history";

/** 标题与描述在主区自成一段，其余六个内置列走属性区（抽屉的属性条 / 整页的右栏） */
const PROPERTY_COLUMN_KEYS: TRequirementBuiltinKey[] = [
  "status",
  "priority",
  "assignee_id",
  "start_date",
  "target_date",
  "parent_id",
];

type TPatch = { builtin?: Partial<TRequirementBuiltinValues>; data?: TRequirementData };

type TProps = {
  workspaceSlug: string;
  productId: string;
  requirement: TRequirement;
  requirementType: TRequirementTypeSchema | null;
  subRequirements: TRequirement[];
  trail: TRequirementTrailEntry[];
  readOnly: boolean;
  /** drawer 把属性排成属性条，page 把它交给右栏渲染 */
  layout: "drawer" | "page";
  resolveParentTitle?: (parentId: string) => string | undefined;
  onPatch: (patch: TPatch) => Promise<unknown>;
  onOpenRequirement: (requirementId: string) => void;
  /** 回滚写的是活行而不是版本链，所以要让调用方重新拉一次这一行 */
  onRolledBack?: () => void;
};

/** 标签 + 值的两列排布，全部叶子字段（非 form）共用同一个网格，值列才有统一的 x 起点 */
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
}) => (
  // 版面够宽，富文本字段直接内联完整编辑器、只读时也渲染真实排版（variant="detail"）
  <div className="grid grid-cols-[minmax(6rem,11rem)_minmax(0,1fr)] items-start gap-x-4 gap-y-2.5">
    {fields.map((field) => (
      <div key={field.id} className="contents">
        <span className="pt-1.5 text-12 text-tertiary">
          {field.name}
          {field.is_required && <span className="ml-0.5 text-danger-primary">*</span>}
        </span>
        <div className="min-w-0">
          {readOnly ? (
            <div className="pt-1.5">
              <LeafValue
                field={field}
                value={requirement.data[field.id]}
                workspaceSlug={workspaceSlug}
                variant="detail"
              />
            </div>
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
          )}
        </div>
      </div>
    ))}
  </div>
);

/**
 * 标题下方的审批徽标：状态胶囊 + 已通过的版本号。
 *
 * 这是详情页第一个要回答的问题 —— 我看到的这些值，是不是评审通过的那一版。动作按钮
 * 不在这里（在 RequirementApprovalPanel），这一块只负责说清楚现在是什么状态。
 */
const RequirementApprovalBadge = ({ requirement }: { requirement: TRequirement }) => {
  const { t } = useTranslation();
  const state = requirement.approval_state;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "inline-flex h-5 items-center gap-1 rounded px-1.5 text-11 font-medium",
          REQUIREMENT_APPROVAL_PILL[state]
        )}
      >
        {state === "pending_deletion" && <Trash2 className="size-3" />}
        {state === "in_review" && <Lock className="size-3" />}
        {t(`requirement_approval.state.${state}`)}
      </span>
      {requirement.approved_version !== null && (
        <span className="text-11 text-tertiary tabular-nums">
          {t("requirement_approval.approved_version", { version: requirement.approved_version })}
        </span>
      )}
    </div>
  );
};

const SectionHeading = ({ label }: { label: string }) => (
  <div className="text-13 font-medium text-primary">{label}</div>
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
  leadingRow,
}: {
  requirement: TRequirement;
  readOnly: boolean;
  parentScope: { workspaceSlug: string; productId: string };
  resolveParentTitle?: (parentId: string) => string | undefined;
  onPatch: (patch: TPatch) => Promise<unknown>;
  leadingRow?: { label: string; value: React.ReactNode };
}) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[minmax(4rem,auto)_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5">
      {leadingRow && (
        <>
          <span className="text-12 text-tertiary">{leadingRow.label}</span>
          <span className="min-w-0 truncate text-13 text-primary">{leadingRow.value}</span>
        </>
      )}
      {PROPERTY_COLUMN_KEYS.map((columnKey) => {
        const column = REQUIREMENT_BUILTIN_COLUMNS.find((item) => item.key === columnKey);
        if (!column) return null;
        if (columnKey === "status" && !shouldShowRequirementStatus(requirement.status)) {
          return null;
        }
        return (
          <div key={columnKey} className="contents">
            <span className="text-12 text-tertiary">{t(column.labelKey)}</span>
            <div className="min-w-0">
              {readOnly ? (
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
    requirement,
    requirementType,
    subRequirements,
    trail,
    readOnly,
    layout,
    resolveParentTitle,
    onPatch,
    onOpenRequirement,
    onRolledBack,
  } = props;
  const { t } = useTranslation();
  const { uploadEditorAsset } = useEditorAsset();
  // 文本类先落本地、失焦再提交：每敲一个字打一次 PATCH 既慢又会把 version 打乱。
  // 描述与富文本字段把这套约定收进了 RequirementRichTextEditor 内部。
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  // 轨迹里点版本徽章 -> 让下面的版本历史展开并滚过去。token 保证同一版重复点也能再触发一次
  const [versionFocus, setVersionFocus] = useState<{ version: number; token: number } | null>(null);
  const focusVersion = useCallback(
    (version: number) => setVersionFocus((prev) => ({ version, token: (prev?.token ?? 0) + 1 })),
    []
  );

  const uploadAsset = useCallback(
    async (file: globalThis.File, imageOnly: boolean) => {
      if (imageOnly && !file.type.startsWith("image/")) throw new Error("Only images are supported.");
      const response = await uploadEditorAsset({
        blockId: uuidv4(),
        data: { entity_identifier: productId, entity_type: EFileAssetType.REQUIREMENT_ATTACHMENT },
        file,
        workspaceSlug,
      });
      return { asset_id: response.asset_id, name: file.name, type: file.type, size: file.size };
    },
    [productId, uploadEditorAsset, workspaceSlug]
  );

  const activeFields = useMemo(
    () => (requirementType?.fields ?? []).filter((field) => field.is_active),
    [requirementType]
  );
  // 叶子字段按模板顺序排成单一字段流。field_category（标准/数据）是模板编辑器的
  // 管理概念，详情页按它分区只会让用户猜「这个字段为什么归在这一类」。
  const leafFields = useMemo(() => activeFields.filter((field) => field.field_type !== "form"), [activeFields]);
  const formFields = useMemo(() => activeFields.filter((field) => field.field_type === "form"), [activeFields]);

  const parentScope = useMemo(() => ({ workspaceSlug, productId }), [productId, workspaceSlug]);
  const commitData = (data: TRequirementData) => void onPatch({ data });

  const isDrawer = layout === "drawer";

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        {requirement.parent_id && (
          <button
            type="button"
            onClick={() => onOpenRequirement(requirement.parent_id as string)}
            className="flex max-w-full items-center gap-1.5 self-start text-12 text-tertiary transition-colors hover:text-primary"
          >
            <CornerDownRight className="size-3 shrink-0 rotate-180" />
            <span className="truncate">
              {resolveParentTitle?.(requirement.parent_id) ?? t("requirement_fields.builtin.parent_unresolved")}
            </span>
          </button>
        )}

        {readOnly ? (
          <h1
            className={cn("font-semibold text-balance text-primary", isDrawer ? "text-20 leading-snug" : "text-22 leading-tight")}
          >
            {requirement.title || t("requirement_detail.untitled")}
          </h1>
        ) : (
          <input
            value={titleDraft ?? requirement.title}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => {
              if (titleDraft !== null && titleDraft !== requirement.title) void onPatch({ builtin: { title: titleDraft } });
              setTitleDraft(null);
            }}
            maxLength={255}
            placeholder={t("requirement_detail.untitled")}
            className={cn(
              "-mx-2 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-0.5 font-semibold text-primary",
              "outline-none placeholder:text-placeholder hover:border-subtle focus:border-accent-primary focus:bg-surface-1",
              isDrawer ? "text-20 leading-snug" : "text-22 leading-tight"
            )}
          />
        )}

        {/* 审批态跟在标题下方，是这一屏第一个要回答的问题：我看到的这些值，是不是评审
            通过的那一版。status（交付进度）退到属性区里去。 */}
        <RequirementApprovalBadge requirement={requirement} />

        {/* 已通过后又改过时，把「你看的不是已通过的那一版」直接说出来，并给出查看差异与
            放弃改动两个出口 —— 这两件事用户过去在系统里都找不到 */}
        <RequirementModifiedBanner
          workspaceSlug={workspaceSlug}
          productId={productId}
          requirement={requirement}
          requirementTypeName={requirementType?.name ?? ""}
          fields={activeFields}
          readOnly={readOnly}
          onDiscarded={onRolledBack}
        />

        {/* 抽屉没有右栏，属性条压在标题下、描述之上 —— 与工作项 peek 的属性条同位；
            整页交给右栏（见 RequirementDetailProperties） */}
        {isDrawer && (
          <RequirementPropertyBar
            requirement={requirement}
            requirementType={requirementType}
            readOnly={readOnly}
            parentScope={parentScope}
            onPatch={onPatch}
          />
        )}

        {/* 描述紧跟标题，不给它单独的小标题 —— 位置已经说明了它是什么。
            限宽到 42rem：正文行长超过这个数就开始需要用手指指着读了 */}
        <div className="max-w-[42rem]">
          {readOnly ? (
            requirement.description_html ? (
              <RequirementRichTextValue
                workspaceSlug={workspaceSlug}
                editorId={`requirement-description-${requirement.id}`}
                value={requirement.description_html}
                containerClassName="-ml-3 border-none text-13"
              />
            ) : (
              <p className="text-13 text-placeholder">{t("requirement_detail.no_description")}</p>
            )
          ) : (
            <RequirementRichTextEditor
              workspaceSlug={workspaceSlug}
              entityId={requirement.id}
              editorId={`requirement-description-${requirement.id}`}
              value={requirement.description_html ?? ""}
              onChange={(html) => void onPatch({ builtin: { description_html: html } })}
              placeholder={t("requirement_detail.no_description")}
              containerClassName="-ml-3 min-h-20 border-none text-13"
            />
          )}
        </div>
      </header>

      {leafFields.length > 0 && (
        <FieldRows
          fields={leafFields}
          requirement={requirement}
          workspaceSlug={workspaceSlug}
          readOnly={readOnly}
          onChange={commitData}
          onUpload={uploadAsset}
        />
      )}

      {formFields.length > 0 && (
        <RequirementSubformSection
          forms={formFields}
          data={requirement.data}
          workspaceSlug={workspaceSlug}
          entityId={requirement.id}
          readOnly={readOnly}
          defaultOpenCount={layout === "page" ? 2 : 1}
          storageKey={`requirement:subforms:${requirement.requirement_type_id}`}
          onChange={commitData}
          onUpload={uploadAsset}
        />
      )}

      {subRequirements.length > 0 && (
        <Section label={t("requirement_detail.sub_requirements")}>
          {/* 一个外框 + 分隔线，而不是 N 张小卡片 */}
          <div className="divide-y divide-subtle overflow-hidden rounded-md border border-subtle">
            {subRequirements.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => onOpenRequirement(child.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-12 transition-colors hover:bg-layer-1"
              >
                <span className="shrink-0">
                  <BuiltinCellValue columnKey="status" values={child} />
                </span>
                <span className="min-w-0 flex-1 truncate text-primary">
                  {child.title || t("requirement_detail.untitled")}
                </span>
                <span className="shrink-0">
                  <BuiltinCellValue columnKey="assignee_id" values={child} />
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/*
        历史区：轨迹含待审与被驳回的改动，版本只有通过审批的那些。
        这一整块讲的是「过去」，与上面的「现在」之间给一条分隔线，其余区块之间只用留白。
      */}
      <div className="flex flex-col gap-6 border-t border-subtle pt-6">
        {/* 轨迹与版本历史各自带折叠标题，不再外包一层 Section，免得标题叠两层 */}
        <RequirementChangeTrail
          entries={trail}
          requirementType={requirementType}
          onFocusVersion={focusVersion}
        />

        <RequirementVersionHistory
          workspaceSlug={workspaceSlug}
          productId={productId}
          requirementId={requirement.id}
          requirementType={requirementType}
          approvedVersion={requirement.approved_version}
          canRollback={!readOnly}
          focusRequest={versionFocus}
          onRolledBack={onRolledBack}
        />
      </div>
    </div>
  );
};

/** 整页右栏的属性区：六个内置列竖排 + 创建/更新元信息 */
export const RequirementDetailProperties = ({
  requirement,
  requirementTypeName,
  readOnly,
  workspaceSlug,
  productId,
  resolveParentTitle,
  onPatch,
}: {
  requirement: TRequirement;
  requirementTypeName: string | null;
  readOnly: boolean;
  workspaceSlug: string;
  productId: string;
  resolveParentTitle?: (parentId: string) => string | undefined;
  onPatch: (patch: TPatch) => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const parentScope = useMemo(() => ({ workspaceSlug, productId }), [productId, workspaceSlug]);

  return (
    <div className="flex h-full flex-col gap-4">
      <span className="text-12 font-medium text-primary">{t("requirement_detail.properties")}</span>

      <PropertyGrid
        requirement={requirement}
        readOnly={readOnly}
        parentScope={parentScope}
        resolveParentTitle={resolveParentTitle}
        onPatch={onPatch}
        leadingRow={{
          label: t("requirement_detail.requirement_type"),
          value: requirementTypeName ?? "—",
        }}
      />

      <div className="mt-auto flex flex-col gap-1 border-t border-subtle pt-3 text-11 text-placeholder">
        <span>{t("requirement_detail.meta.created_at", { date: requirement.created_at?.slice(0, 10) ?? "—" })}</span>
        <span>{t("requirement_detail.meta.updated_at", { date: requirement.updated_at?.slice(0, 10) ?? "—" })}</span>
        {requirement.approved_version !== null && (
          <span>{t("requirement_approval.approved_version", { version: requirement.approved_version })}</span>
        )}
      </div>
    </div>
  );
};
