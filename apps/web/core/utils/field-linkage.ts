import type {
  TFieldLinkage,
  TIssueExtraFieldValue,
  TIssueTypeExtraField,
  TLinkageCondition,
  TLinkageRule,
  TLinkageTypeCondition,
} from "@plane/types";
import type { TIssueType } from "@/services/project/project-issue-type.service";

export type TLinkageField = Pick<
  TIssueTypeExtraField,
  "id" | "name" | "field_type" | "options" | "is_active" | "linkage"
>;
/** 类型条件的候选：类型库里的类型 */
export type TLinkageIssueType = Pick<TIssueType, "id" | "name" | "logo_props">;

export const isTypeCondition = (condition: TLinkageCondition): condition is TLinkageTypeCondition =>
  "type_ids" in condition;

const visibilityRules = (linkage?: TFieldLinkage) => linkage?.visibility?.rules ?? [];
const optionRules = (linkage?: TFieldLinkage) => linkage?.options?.rules ?? [];

/**
 * 规则是否适用于该类型：没有类型条件的规则适用于所有类型。
 * 不给 typeId 是类型字段行的口径（后端绑定时已按类型筛过规则、去掉了类型条件），带类型条件的规则不适用。
 */
export const ruleAppliesToType = (rule: TLinkageRule, typeId?: string) =>
  rule.conditions.every(
    (condition) => !isTypeCondition(condition) || (typeId !== undefined && condition.type_ids.includes(typeId))
  );

export const hasTypeCondition = (linkage?: TFieldLinkage) =>
  [...visibilityRules(linkage), ...optionRules(linkage)].some((rule) => rule.conditions.some(isTypeCondition));

/** 规则里出现过的类型 id，按出现顺序去重 */
export const linkageTypeIds = (linkage?: TFieldLinkage): string[] =>
  Array.from(
    new Set(
      [...visibilityRules(linkage), ...optionRules(linkage)]
        .flatMap((rule) => rule.conditions)
        .flatMap((condition) => (isTypeCondition(condition) ? condition.type_ids : []))
    )
  );

/**
 * 规则引用到的字段 id。给了 typeId 时只算该类型上实际生效的规则，与后端按类型补依赖的口径一致：
 * 规则不适用于该类型不算，条件显示里有只含类型条件的规则（该类型始终显示）时整组不算。
 */
export const linkageSources = (linkage?: TFieldLinkage, typeId?: string): string[] => {
  let visibility = visibilityRules(linkage);
  let options: TLinkageRule[] = optionRules(linkage);
  if (typeId !== undefined) {
    visibility = visibility.filter((rule) => ruleAppliesToType(rule, typeId));
    if (visibility.some((rule) => rule.conditions.every(isTypeCondition))) visibility = [];
    options = options.filter((rule) => ruleAppliesToType(rule, typeId));
  }
  const ids = [...visibility, ...options]
    .flatMap((rule) => rule.conditions)
    .flatMap((condition) => (isTypeCondition(condition) || !condition.field_id ? [] : [condition.field_id]));
  return Array.from(new Set(ids));
};

export function linkageChoices(field: Pick<TLinkageField, "options">): { key: string; label: string }[] {
  const options = field.options;
  const raw = Array.isArray(options) ? options : (options?.choices ?? options?.options ?? options?.values ?? []);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item: unknown) => {
    if (typeof item === "string" || typeof item === "number") return [{ key: String(item), label: String(item) }];
    if (!item || typeof item !== "object") return [];
    const value = item as { key?: unknown; value?: unknown; label?: unknown; name?: unknown };
    const key = value.key ?? value.value;
    return key === undefined || key === null
      ? []
      : [{ key: String(key), label: String(value.label ?? value.name ?? key) }];
  });
}

export function dependencyClosure(fields: TLinkageField[], ids: string[], typeId?: string): TLinkageField[] {
  const result: TLinkageField[] = [];
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const field = fields.find((f) => f.id === id);
    if (!field) return;
    linkageSources(field.linkage, typeId).forEach(visit);
    result.push(field);
  };
  ids.forEach(visit);
  return result;
}

/** 去掉开着但一行规则都没有的联动（等于没开），保存和校验都按它算 */
export function compactLinkage(linkage: TFieldLinkage): TFieldLinkage {
  return {
    ...(linkage.visibility?.rules.length ? { visibility: linkage.visibility } : {}),
    ...(linkage.options?.rules.length ? { options: linkage.options } : {}),
  };
}

/** 保存前的规则完整性检查；没问题返回 null。文案都带「联动」，弹窗据此切到联动规则页签 */
export function getLinkageError(linkage: TFieldLinkage): string | null {
  for (const rule of [...visibilityRules(linkage), ...optionRules(linkage)]) {
    // 规则表里空单元格就是没有这个条件；整行都空着时这条规则没有意义
    if (!rule.conditions.length) return "请为联动规则的每一行至少选择一个条件。";
    const incomplete = rule.conditions.some((condition) =>
      isTypeCondition(condition) ? !condition.type_ids.length : !condition.field_id || !condition.values.length
    );
    if (incomplete) return "请为联动规则的条件选择取值。";
  }
  if (optionRules(linkage).some((rule) => !rule.options.length)) return "请为可选项联动的每一行选择可选项。";
  return null;
}

/** 「工作项类型 为 缺陷、需求 且 发现阶段 为 线上」 */
export function describeLinkageConditions(
  conditions: TLinkageCondition[],
  fields: TLinkageField[],
  issueTypes: TLinkageIssueType[] = []
): string {
  return conditions
    .map((condition) => {
      if (isTypeCondition(condition)) {
        const names = condition.type_ids.map(
          (id) => issueTypes.find((type) => type.id === id)?.name ?? "已删除的类型"
        );
        return `工作项类型 为 ${names.join("、")}`;
      }
      const source = fields.find((field) => field.id === condition.field_id);
      if (!source) return "已失效的字段";
      const labels = new Map(linkageChoices(source).map((choice) => [choice.key, choice.label]));
      return `${source.name} 为 ${condition.values.map((value) => labels.get(value) ?? value).join("、")}`;
    })
    .join(" 且 ");
}

/**
 * Shared by create, edit and read-only detail; never writes persisted values.
 * `typeId` 只在字段库预览里给（规则还带着类型条件）；工作项表单里的类型字段行不用给。
 */
export function evaluateFieldLinkage<T extends TLinkageField>(
  fields: T[],
  values: TIssueExtraFieldValue[] = [],
  typeId?: string
) {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const normalized = new Map(values.map((v) => [v.extra_field_id, v.value]));
  const visible = new Set<string>();
  const resolved = new Map<string, T>();
  const visited = new Set<string>();
  const visiting = new Set<string>();
  /** 命中的可选项规则序号（从 0 起）；字段在该类型上不受可选项联动限制时没有这一项 */
  const matchedOptionRules = new Map<string, number[]>();
  const selected = (id: string): string[] => {
    if (!visible.has(id)) return [];
    const value = normalized.get(id);
    return (Array.isArray(value) ? value : [value]).filter((v) => v !== null && v !== undefined).map(String);
  };
  const fieldConditionsMet = (rule: TLinkageRule) =>
    rule.conditions.every(
      (condition) =>
        isTypeCondition(condition) || selected(condition.field_id).some((v) => condition.values.includes(v))
    );
  const visit = (id: string) => {
    if (visited.has(id) || visiting.has(id)) return;
    const field = byId.get(id);
    if (!field) return;
    visiting.add(id);
    linkageSources(field.linkage).forEach(visit);
    const conditions = visibilityRules(field.linkage).filter((rule) => ruleAppliesToType(rule, typeId));
    const shown = field.is_active !== false && (!conditions.length || conditions.some(fieldConditionsMet));
    if (shown) visible.add(id);
    else normalized.set(id, null);
    const cascades = optionRules(field.linkage)
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => ruleAppliesToType(rule, typeId));
    let effective = field;
    if (cascades.length) {
      const hits = cascades.filter(({ rule }) => fieldConditionsMet(rule));
      matchedOptionRules.set(
        id,
        hits.map((hit) => hit.index)
      );
      const allowed = new Set(hits.flatMap((hit) => hit.rule.options));
      const choices = linkageChoices(field).filter((o) => allowed.has(o.key));
      const keys = new Set(choices.map((o) => o.key));
      const value = normalized.get(id);
      if (Array.isArray(value))
        normalized.set(
          id,
          value.filter((v) => keys.has(String(v)))
        );
      else if (value !== undefined && value !== null && !keys.has(String(value))) normalized.set(id, null);
      effective = { ...field, options: { ...field.options, choices } };
    }
    resolved.set(id, effective);
    visiting.delete(id);
    visited.add(id);
  };
  fields.forEach((f) => visit(f.id));
  const next = values.map((v) => ({ ...v, value: normalized.get(v.extra_field_id) ?? null }));
  return {
    fields: fields.filter((f) => visible.has(f.id)).map((f) => resolved.get(f.id)!),
    values: next,
    matchedOptionRules,
  };
}
