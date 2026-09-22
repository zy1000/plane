/**
 * 阶段类型：工作区级的研发阶段词表，评审模板树挂在它上面。
 *
 * 与 `product_stage` 数据字典分家 —— 那本字典是产品的「当前阶段」属性，两者初始词表
 * 同源，建完之后各改各的、互不影响。预置的 10 个（is_system）编码与名称锁死。
 */

export type TStageType = {
  id: string;
  workspace: string;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** 挂在评审模板等消费方上的精简形状 */
export type TStageTypeLite = Pick<TStageType, "id" | "code" | "name">;

export type TCreateStageTypePayload = {
  code: string;
  name: string;
  description?: string;
};

export type TUpdateStageTypePayload = Partial<{
  code: string;
  name: string;
  description: string;
  sort_order: number;
}>;

export type TStageTypeErrorCode =
  | "STAGE_TYPE_CODE_REQUIRED"
  | "STAGE_TYPE_NAME_REQUIRED"
  | "STAGE_TYPE_CODE_ALREADY_EXISTS"
  | "STAGE_TYPE_NAME_ALREADY_EXISTS"
  | "STAGE_TYPE_SYSTEM_CODE_READONLY"
  | "STAGE_TYPE_SYSTEM_NAME_READONLY"
  | "STAGE_TYPE_SYSTEM_PROTECTED"
  | "STAGE_TYPE_IN_USE";
