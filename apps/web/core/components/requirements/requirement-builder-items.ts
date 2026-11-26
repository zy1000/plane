import {
  AlignLeft,
  Braces,
  FileImage,
  FormInput,
  ListChecks,
  Paperclip,
  TextCursorInput,
  ToggleLeft,
  Type,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TRequirementFieldDraft, TRequirementFieldType } from "@plane/types";
import type { TRequirementBuilderItem } from "@/components/requirements/use-requirement-type-editor-state";

/** 字段类型图标：字段库、字段行与回收站共用，放这里避免回收站反向引用 builder */
export const FIELD_ICONS = {
  text: Type,
  member: UserRound,
  select: ListChecks,
  form: FormInput,
  rich_text: AlignLeft,
  attachment: Paperclip,
  image: FileImage,
  boolean: ToggleLeft,
  rule: Braces,
  rule_value: TextCursorInput,
} satisfies Record<TRequirementFieldType, LucideIcon>;

/**
 * 字段回收站的纯函数：回收站 = 草稿里 is_active=false 的自定义字段。
 *
 * 顺序不变量：停用的根字段恒在 items 尾部，停用的子字段恒在 children 尾部。
 * 主列表与子字段列表的 Sortable 只拿 active 段，回写时把 inactive 段拼回去 ——
 * builtin_fields.position 用的是 items 下标，这样它才与主列表的视觉顺序一致。
 */

export const requirementFieldKey = (field: TRequirementFieldDraft) => field.id ?? field.client_id ?? "";

/**
 * 「取值规则」与「动态取值」靠同级字段互相引用（config.rule_field_id），脱离具体的
 * 需求类型没有意义，所以不进通用字段库，也不能「转为通用字段」。
 */
export const isRuleFieldType = (type: TRequirementFieldType) => type === "rule" || type === "rule_value";

export type TRuleSourceOption = { key: string; name: string };

/** 一组同级字段里可当规则来源的：启用中的「取值规则」字段。key 没落库时是 client_id，保存时后端换成真实 id */
export const ruleSourceOptions = (siblings: TRequirementFieldDraft[]): TRuleSourceOption[] =>
  siblings
    .filter((field) => field.is_active && field.field_type === "rule")
    .map((field) => ({ key: requirementFieldKey(field), name: field.name }));

export type TRuleValueConfigIssue =
  | { kind: "source"; name: string }
  | { kind: "library"; name: string; source: string };

/**
 * 「动态取值」字段的配置问题：没选规则来源（或来源已不在同级），或者自己纳入了标准库而来源没纳入
 * —— 标准库里没有规则，这个取值就没法填。根字段一层、每个表单的子字段各一层，逐层检查。
 */
export const findRuleValueConfigIssue = (roots: TRequirementFieldDraft[]): TRuleValueConfigIssue | null => {
  const checkLevel = (fields: TRequirementFieldDraft[]): TRuleValueConfigIssue | null => {
    const active = fields.filter((field) => field.is_active);
    for (const field of active) {
      if (field.field_type !== "rule_value") continue;
      const source = active.find(
        (candidate) => candidate.field_type === "rule" && requirementFieldKey(candidate) === field.config.rule_field_id
      );
      if (!source) return { kind: "source", name: field.name };
      if (field.show_in_library && !source.show_in_library) {
        return { kind: "library", name: field.name, source: source.name };
      }
    }
    return null;
  };
  const activeRoots = roots.filter((field) => field.is_active);
  return (
    checkLevel(roots) ??
    activeRoots.map((field) => (field.field_type === "form" ? checkLevel(field.children) : null)).find(Boolean) ??
    null
  );
};

export type TRequirementFieldTarget = { rootKey: string; childKey?: string };

export type TRequirementBinEntry =
  | { kind: "root"; field: TRequirementFieldDraft }
  | { kind: "child"; parent: TRequirementFieldDraft; field: TRequirementFieldDraft };

type TCustomBuilderItem = Extract<TRequirementBuilderItem, { kind: "custom" }>;

const isInactiveCustomItem = (item: TRequirementBuilderItem): item is TCustomBuilderItem =>
  item.kind === "custom" && !item.field.is_active;

export const splitBuilderItems = (items: TRequirementBuilderItem[]) => ({
  active: items.filter((item) => !isInactiveCustomItem(item)),
  inactive: items.filter(isInactiveCustomItem),
});

export const splitFieldsByActive = (fields: TRequirementFieldDraft[]) => ({
  active: fields.filter((field) => field.is_active),
  inactive: fields.filter((field) => !field.is_active),
});

/** 停用的根字段 + 活跃根下停用的子字段；停用根的子字段随根走，不单列 */
export const collectRecycleBinEntries = (items: TRequirementBuilderItem[]): TRequirementBinEntry[] =>
  items.flatMap((item): TRequirementBinEntry[] => {
    if (item.kind !== "custom") return [];
    if (!item.field.is_active) return [{ kind: "root", field: item.field }];
    return item.field.children
      .filter((child) => !child.is_active)
      .map((child) => ({ kind: "child", parent: item.field, field: child }));
  });

export const binEntryTarget = (entry: TRequirementBinEntry): TRequirementFieldTarget =>
  entry.kind === "root"
    ? { rootKey: requirementFieldKey(entry.field) }
    : { rootKey: requirementFieldKey(entry.parent), childKey: requirementFieldKey(entry.field) };

const setRootActive = (items: TRequirementBuilderItem[], rootKey: string, isActive: boolean) => {
  const target = items.find(
    (item): item is TCustomBuilderItem => item.kind === "custom" && requirementFieldKey(item.field) === rootKey
  );
  if (!target) return items;
  const { active, inactive } = splitBuilderItems(items.filter((item) => item !== target));
  const next: TRequirementBuilderItem = { ...target, field: { ...target.field, is_active: isActive } };
  return isActive ? [...active, next, ...inactive] : [...active, ...inactive, next];
};

const setChildActive = (items: TRequirementBuilderItem[], target: TRequirementFieldTarget, isActive: boolean) =>
  items.map((item) => {
    if (item.kind !== "custom" || requirementFieldKey(item.field) !== target.rootKey) return item;
    const child = item.field.children.find((candidate) => requirementFieldKey(candidate) === target.childKey);
    if (!child) return item;
    const { active, inactive } = splitFieldsByActive(item.field.children.filter((candidate) => candidate !== child));
    const next = { ...child, is_active: isActive };
    return {
      ...item,
      field: { ...item.field, children: isActive ? [...active, next, ...inactive] : [...active, ...inactive, next] },
    };
  });

/** 移入回收站：置 is_active=false 并挪到所在列表的尾部 */
export const moveFieldToBin = (items: TRequirementBuilderItem[], target: TRequirementFieldTarget) =>
  target.childKey ? setChildActive(items, target, false) : setRootActive(items, target.rootKey, false);

/** 恢复：置 is_active=true，放到活跃段末尾（不回原位） */
export const restoreFieldFromBin = (items: TRequirementBuilderItem[], target: TRequirementFieldTarget) =>
  target.childKey ? setChildActive(items, target, true) : setRootActive(items, target.rootKey, true);
