import type { TLogoProps } from "./common";
import type { IUserLite } from "./users";
import type {
  TRequirementBuiltinFieldConfig,
  TRequirementBuiltinFieldPayload,
  TRequirementField,
  TRequirementFieldDraft,
} from "./requirement";

/**
 * 需求类型：工作区级的字段定义源。
 *
 * 它只定义字段结构 —— 没有状态、审批、版本、明细行，也不归属产品或项目。
 */
export type TRequirementType = {
  id: string;
  workspace_id: string;
  name: string;
  /** 纯文本，不是 HTML */
  description: string;
  owner_id: string;
  owner_detail: IUserLite;
  field_count: number;
  /** 有多少个标准库引用了它 —— 删除守卫与列表页的「被使用」列都看这个 */
  library_count: number;
  is_active: boolean;
  sort_order: number;
  /** 图标配置，与工作项类型同形状：{ icon: { name, color, background_color } } */
  logo_props: Partial<TLogoProps>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TCreateRequirementTypePayload = {
  name: string;
  description?: string;
  owner_id?: string;
  is_active?: boolean;
  logo_props?: Partial<TLogoProps>;
};

export type TUpdateRequirementTypePayload = Partial<
  Pick<TRequirementType, "name" | "description" | "is_active" | "owner_id" | "sort_order" | "logo_props">
>;

export type TRequirementTypeConfiguration = {
  requirement_type: TRequirementType;
  fields: TRequirementField[];
  /** 内置字段布局（服务端已归一化，恒 7 项）。旧后端/旧缓存可能没有 */
  builtin_fields?: TRequirementBuiltinFieldConfig[];
  /** 新建字段的 client_id -> 服务端 id */
  created_field_ids: Record<string, string>;
};

export type TRequirementTypeConfigurationPayload = {
  /** 乐观锁基准 = requirement_type.updated_at */
  expected_updated_at: string;
  /** 名称、描述与图标跟字段在同一次请求里保存，共用同一把锁 */
  requirement_type?: Partial<Pick<TRequirementType, "name" | "description" | "is_active" | "logo_props">>;
  fields: TRequirementFieldDraft[];
  /** 内置字段布局；position 是与 fields 根字段合并后的统一下标。编辑器恒发送 */
  builtin_fields?: TRequirementBuiltinFieldPayload[];
  /** 删字段会清掉引用该类型的明细行里的数据，需二次确认 */
  confirm_data_loss?: boolean;
};
