import { cloneDeep } from "lodash-es";
import { v4 as uuidv4 } from "uuid";
import type { TRequirementData, TRequirementValue, TRequirementField, TRequirementFormRow } from "@plane/types";

/**
 * 需求行「值」的两个构造器。网格、建行弹窗、复制行共用。
 *
 * 这里原本还住着 useRequirementGridEditor —— 那套「点编辑 -> 攒一批草稿 -> 点保存更改」
 * 的暂存机制。单元格改成即时保存（use-requirement-row-autosave）、新增改走弹窗
 * （requirement-create-modal）之后，草稿行、脏值追踪、离开页面拦截都不再需要，
 * 整个 hook 随之删除，只留下这两个纯函数。
 */

const initialLeafValue = (field: TRequirementField): TRequirementValue => {
  if (field.default_value !== null && field.default_value !== undefined) return cloneDeep(field.default_value);
  if (field.field_type === "attachment" || field.field_type === "image") return [];
  if (field.field_type === "select" && field.config.selection_mode === "multiple") return [];
  return null;
};

export const createEmptyRequirementData = (fields: TRequirementField[]): TRequirementData =>
  Object.fromEntries(fields.map((field) => [field.id, field.field_type === "form" ? [] : initialLeafValue(field)]));

/**
 * 深拷贝一行的自定义字段值，并给子表单的每一行重新分配 UUID ——
 * 否则新旧两行的表单行 ID 会撞在一起。
 */
export const copyRequirementData = (data: TRequirementData, fields: TRequirementField[]): TRequirementData => {
  const copied = cloneDeep(data);
  fields
    .filter((field) => field.field_type === "form")
    .forEach((field) => {
      const rows = copied[field.id];
      if (!Array.isArray(rows)) return;
      copied[field.id] = rows.map((row) =>
        Object.assign({}, row as TRequirementFormRow, {
          id: uuidv4(),
        })
      );
    });
  return copied;
};
