import { ChevronDown, GripVertical, Lock } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  TRequirementFieldDefinition,
  TRequirementFieldDefinitionNode,
  TRequirementFieldDraft,
} from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { IssueTypeTag } from "@/components/project-issue-types/field-display";
import { FIELD_ICONS } from "@/components/requirements/requirement-builder-items";
import { getRequirementSelectMode, getRequirementSelectOptions } from "@/components/requirements/requirement-select";

/**
 * 需求类型配置页里「通用字段」相关的展示件：左栏的通用字段列表、绑定字段展开后的只读卡片、
 * 绑定表单的只读子字段。通用字段的定义只在模板中心的「需求通用字段库」里改，这里一律只读，
 * 本类型能定的只有排序、纳入标准库和移入回收站。
 */

/** 从左栏拖通用字段进字段结构时用的 MIME，载荷是库字段 id */
export const COMMON_FIELD_DRAG_TYPE = "application/x-requirement-common-field";

export const COMMON_FIELD_BADGE =
  "shrink-0 rounded border border-accent-subtle bg-accent-subtle px-1.5 py-0.5 text-11 font-medium text-accent-primary";

/** 配置页传给 RequirementFieldBuilder 的通用字段库接线 */
export type TRequirementCommonFieldsBinding = {
  definitions: TRequirementFieldDefinition[];
  isLoading: boolean;
  /** 去字段库；带 id 时直接打开该字段的编辑弹窗。未保存草稿的确认由外壳负责 */
  onOpenLibrary: (definitionId?: string) => void;
  /** 把保存过的私有字段转为通用字段；不传则不出这个菜单项 */
  onPromote?: (field: TRequirementFieldDraft) => void;
};

type TTranslate = (key: string, params?: Record<string, unknown>) => string;

/** 字段类型的简述：选择器写成「单选 · N 个选项」，其余是类型名 */
export const describeRequirementFieldType = (
  t: TTranslate,
  field: Pick<TRequirementFieldDraft, "field_type" | "config">
) =>
  field.field_type === "select"
    ? t("requirement_fields.builder.selector_summary", {
        mode: t(
          `requirement_fields.builder.${getRequirementSelectMode(field) === "multiple" ? "multiple_select" : "single_select"}`
        ),
        count: getRequirementSelectOptions(field).length,
      })
    : t(`requirement_fields.field_types.${field.field_type}`);

const toBoundNode = (node: TRequirementFieldDefinitionNode): TRequirementFieldDraft => ({
  client_id: uuidv4(),
  library_field_id: node.id,
  name: node.name,
  field_type: node.field_type,
  is_required: node.is_required,
  is_active: true,
  show_in_library: true,
  config: { ...node.config },
  default_value: node.default_value,
  children: [],
});

/** 库字段 -> 绑定它的新字段草稿。定义只是给界面看的，保存时后端以库为准 */
export const toBoundFieldDraft = (definition: TRequirementFieldDefinition): TRequirementFieldDraft => ({
  ...toBoundNode(definition),
  children: definition.children.map(toBoundNode),
});

type TCommonFieldListProps = {
  definitions: TRequirementFieldDefinition[];
  isLoading: boolean;
  search: string;
  /** 本类型已经添加过的库字段（含回收站里的） */
  boundIds: Set<string>;
  onDragStart: (definitionId: string) => void;
  onDragEnd: () => void;
};

/** 左栏「通用字段」页签：拖进字段结构即添加；已添加的置灰，一个通用字段在一个类型里只能用一次 */
export function RequirementCommonFieldList(props: TCommonFieldListProps) {
  const { definitions, isLoading, search, boundIds, onDragStart, onDragEnd } = props;
  const { t } = useTranslation();
  const keyword = search.trim().toLocaleLowerCase();
  const visible = definitions.filter((definition) => definition.name.toLocaleLowerCase().includes(keyword));

  if (isLoading) {
    return (
      <Loader className="space-y-1.5">
        {[0, 1, 2].map((index) => (
          <Loader.Item key={index} height="40px" />
        ))}
      </Loader>
    );
  }
  if (definitions.length === 0) {
    return <p className="px-1 py-6 text-center text-12 leading-5 text-tertiary">字段库里还没有通用字段</p>;
  }
  if (visible.length === 0) {
    return <p className="px-1 py-6 text-center text-12 leading-5 text-tertiary">没有匹配的字段</p>;
  }

  return (
    <div className="space-y-1.5">
      {visible.map((definition) => {
        const Icon = FIELD_ICONS[definition.field_type];
        const isAdded = boundIds.has(definition.id);
        return (
          <div
            key={definition.id}
            role="button"
            tabIndex={0}
            aria-disabled={isAdded}
            draggable={!isAdded}
            onDragStart={(event) => {
              onDragStart(definition.id);
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData(COMMON_FIELD_DRAG_TYPE, definition.id);
            }}
            onDragEnd={onDragEnd}
            title={definition.name}
            className={cn(
              "group flex h-10 w-full items-center gap-2 rounded-md border border-subtle px-2.5 text-left transition-colors duration-150",
              isAdded
                ? "cursor-default bg-layer-1"
                : "cursor-grab bg-surface-1 hover:border-strong hover:bg-layer-transparent-hover active:cursor-grabbing"
            )}
          >
            {!isAdded && (
              <GripVertical className="size-3.5 shrink-0 text-placeholder group-hover:text-tertiary" />
            )}
            <span className="grid size-6 shrink-0 place-items-center rounded border border-subtle bg-layer-1 text-secondary">
              <Icon className="size-3.5" />
            </span>
            <span className={cn("min-w-0 flex-1 truncate text-12 font-medium", isAdded ? "text-tertiary" : "text-primary")}>
              {definition.name}
            </span>
            <span className="shrink-0 text-11 text-tertiary">
              {isAdded
                ? "已添加"
                : definition.field_type === "select"
                  ? t(
                      `requirement_fields.builder.${
                        getRequirementSelectMode(definition) === "multiple" ? "multiple_select" : "single_select"
                      }`
                    )
                  : t(`requirement_fields.field_types.${definition.field_type}`)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 绑定表单的子字段：整组取自库，本类型里不能增删改、不能排序 */
export function RequirementCommonChildRows({ fields }: { fields: TRequirementFieldDraft[] }) {
  const { t } = useTranslation();
  if (fields.length === 0) return <p className="py-1 text-12 text-tertiary">暂无子字段</p>;
  return (
    <div className="space-y-2">
      {fields.map((child) => (
        <div
          key={child.id ?? child.client_id}
          className="flex items-center gap-3 rounded-md border border-subtle bg-surface-1 px-3 py-2 text-sm"
        >
          <Lock className="size-4 shrink-0 text-placeholder" />
          <span className="min-w-0 flex-1 truncate font-medium text-primary">
            {child.name}
            {child.is_required && (
              <span className="ml-1 font-normal text-secondary">({t("requirement_fields.fields.required")})</span>
            )}
          </span>
          <span className="shrink-0 text-xs text-secondary">{describeRequirementFieldType(t, child)}</span>
        </div>
      ))}
    </div>
  );
}

type TCommonFieldCardProps = {
  field: TRequirementFieldDraft;
  /** 库里的这条定义；字段库还没拉回来或已被删时为空，只是不显示「使用的类型」 */
  definition?: TRequirementFieldDefinition;
  onToggleShowInLibrary: (next: boolean) => void;
  onCancel: () => void;
  onDone: () => void;
  onOpenLibrary: () => void;
};

/**
 * 绑定字段展开后的只读卡片，与私有字段的内联表单同构（左：这个字段是什么；右：怎么填）。
 * 能改的只有「纳入标准库」—— 必填字段必须纳入，所以必填时这个勾也锁住。
 */
export function RequirementCommonFieldCard(props: TCommonFieldCardProps) {
  const { field, definition, onToggleShowInLibrary, onCancel, onDone, onOpenLibrary } = props;
  const { t } = useTranslation();
  const options = field.field_type === "select" ? getRequirementSelectOptions(field) : [];
  const description = String(field.config.description ?? "").trim();
  const usedBy = definition?.used_by ?? [];

  return (
    <div className="grid grid-cols-1 divide-y divide-subtle md:grid-cols-[1fr_360px] md:divide-x md:divide-y-0">
      <div className="flex min-h-32 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-16 font-medium text-primary">{field.name}</span>
          <span className={COMMON_FIELD_BADGE}>通用字段</span>
        </div>
        {description && <p className="text-13 leading-5 text-secondary">{description}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-layer-1 px-3 py-2.5">
          <span className="text-13 text-secondary">定义由通用字段库统一维护</span>
          <Button variant="secondary" size="sm" onClick={onOpenLibrary}>
            编辑通用字段
          </Button>
        </div>
        {usedBy.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-12 text-secondary">
            <span className="mr-0.5">使用的类型</span>
            {usedBy.map((type) => (
              <IssueTypeTag
                key={type.requirement_type_id}
                name={type.name}
                icon={type.logo_props?.icon}
                className="max-w-40 min-w-0 shrink"
              />
            ))}
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-subtle pt-3 text-12 text-secondary">
          <label className={cn("flex items-center gap-2", field.is_required && "cursor-not-allowed text-disabled")}>
            <input
              type="checkbox"
              checked={field.show_in_library}
              disabled={field.is_required}
              onChange={(event) => onToggleShowInLibrary(event.target.checked)}
              className="size-3.5 rounded border border-subtle accent-accent-primary disabled:cursor-not-allowed"
            />
            {t("requirement_fields.builder.library_title")}
          </label>
          <label className="flex cursor-not-allowed items-center gap-2 text-disabled">
            <input
              type="checkbox"
              checked={field.is_required}
              disabled
              readOnly
              className="size-3.5 rounded border border-subtle accent-accent-primary disabled:cursor-not-allowed"
            />
            {t("requirement_fields.builder.required_title")}
            <Lock className="size-3" />
          </label>
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-4 p-4">
        <div className="flex flex-col gap-3">
          <div>
            <span className="mb-1.5 block text-12 font-medium text-secondary">
              {t("requirement_fields.builder.field_type")}
            </span>
            <div className="flex h-9 w-full items-center justify-between rounded-md border border-subtle bg-layer-1 px-3 text-12 text-secondary">
              {t(`requirement_fields.field_types.${field.field_type}`)}
              <Lock className="size-3.5 text-placeholder" />
            </div>
          </div>
          {field.field_type === "select" && (
            <section className="overflow-hidden rounded-lg border border-subtle bg-layer-1/40">
              <div className="border-b border-subtle px-3 py-3">
                <p className="text-12 font-medium text-primary">{t("requirement_fields.builder.selection_mode")}</p>
                <div className="mt-2 grid grid-cols-2 rounded-md border border-subtle bg-surface-1 p-0.5">
                  {(["single", "multiple"] as const).map((mode) => (
                    <span
                      key={mode}
                      className={cn(
                        "grid h-7 place-items-center rounded text-11 font-medium",
                        getRequirementSelectMode(field) === mode ? "bg-layer-2 text-primary" : "text-tertiary"
                      )}
                    >
                      {t(`requirement_fields.builder.${mode === "multiple" ? "multiple_select" : "single_select"}`)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-12 font-medium text-primary">{t("requirement_fields.builder.selector_options")}</p>
                  <span className="rounded bg-layer-2 px-1.5 py-0.5 text-10 font-medium text-secondary">
                    {options.length}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {options.map((option, index) => (
                    <div
                      key={option.id}
                      className="flex items-center gap-2 rounded-md border border-subtle bg-layer-1 px-2 py-1.5"
                    >
                      <span className="grid size-5 shrink-0 place-items-center rounded bg-layer-2 text-10 font-medium text-secondary">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-12 text-primary">{option.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-subtle pt-3">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={onDone}>
            {t("requirement_fields.builder.done_editing")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 左栏顶部的「字段类型 / 通用字段」切换 */
export function RequirementFieldSourceTabs({
  value,
  onChange,
}: {
  value: "types" | "common";
  onChange: (next: "types" | "common") => void;
}) {
  return (
    <div
      className="mt-3 grid grid-cols-2 rounded-md border border-subtle bg-surface-1 p-0.5"
      role="tablist"
      aria-label="字段来源"
    >
      {(
        [
          ["types", "字段类型"],
          ["common", "通用字段"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "h-7 rounded text-12 font-medium transition-colors",
            value === key
              ? "bg-layer-2 text-primary shadow-sm"
              : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** 只读的下拉外观：通用字段编辑弹窗里锁定的字段类型用 */
export function LockedSelectBox({ label }: { label: string }) {
  return (
    <div className="flex h-10 w-full items-center justify-between rounded-lg border border-subtle-1 bg-layer-1 px-3 text-14 text-secondary">
      {label}
      <span className="flex items-center gap-1.5 text-placeholder">
        <Lock className="size-3.5" />
        <ChevronDown className="size-3.5" />
      </span>
    </div>
  );
}
