import type { TFieldLinkage, TIssueExtraFieldValue, TIssueTypeExtraField } from "@plane/types";

export type TLinkageField = Pick<
  TIssueTypeExtraField,
  "id" | "name" | "field_type" | "options" | "is_active" | "linkage"
>;
export const linkageSources = (rules?: TFieldLinkage): string[] =>
  [rules?.visibility?.field_id, rules?.options?.field_id].filter((id): id is string => Boolean(id));

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

export function dependencyClosure(fields: TLinkageField[], ids: string[]): TLinkageField[] {
  const result: TLinkageField[] = [];
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const field = fields.find((f) => f.id === id);
    if (!field) return;
    linkageSources(field.linkage).forEach(visit);
    result.push(field);
  };
  ids.forEach(visit);
  return result;
}

/** Shared by create, edit and read-only detail; never writes persisted values. */
export function evaluateFieldLinkage<T extends TLinkageField>(fields: T[], values: TIssueExtraFieldValue[] = []) {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const normalized = new Map(values.map((v) => [v.extra_field_id, v.value]));
  const visible = new Set<string>();
  const resolved = new Map<string, T>();
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const selected = (id: string): string[] => {
    if (!visible.has(id)) return [];
    const value = normalized.get(id);
    return (Array.isArray(value) ? value : [value]).filter((v) => v !== null && v !== undefined).map(String);
  };
  const visit = (id: string) => {
    if (visited.has(id) || visiting.has(id)) return;
    const field = byId.get(id);
    if (!field) return;
    visiting.add(id);
    linkageSources(field.linkage).forEach(visit);
    const condition = field.linkage?.visibility;
    const shown =
      field.is_active !== false &&
      (!condition || selected(condition.field_id).some((v) => condition.values.includes(v)));
    if (shown) visible.add(id);
    else normalized.set(id, null);
    const cascade = field.linkage?.options;
    let effective = field;
    if (cascade) {
      const allowed = new Set(selected(cascade.field_id).flatMap((v) => cascade.mappings[v] ?? []));
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
  return { fields: fields.filter((f) => visible.has(f.id)).map((f) => resolved.get(f.id)!), values: next };
}
