/**
 * 研发模式：工作区级的开发方式定义，决定项目能用哪些组件、有哪些阶段、每阶段启用哪些评审。
 *
 * 预置三个（IDOV / Scrum / 混合模式，`is_system`）不可删、不可改名；组件开关、描述、
 * 图标、阶段都可以改。项目侧要到批次 3 才会引用模式。
 */

import type { TLogoProps } from "./common";
import type { TStageTypeLite } from "./stage-type";

/** 组件开关的九个 key。与后端 seed_data/dev_modes.py::FEATURE_KEYS 一一对应。 */
export type TDevModeFeatureKey =
  | "cycle_view"
  | "module_view"
  | "release_view"
  | "issue_views_view"
  | "page_view"
  | "intake_view"
  | "is_time_tracking_enabled"
  | "is_issue_type_enabled"
  | "review_view";

export type TDevModeFeatures = Record<TDevModeFeatureKey, boolean>;

/** 开关的展示顺序，也是详情页与表单里的排列顺序 */
export const DEV_MODE_FEATURE_KEYS: TDevModeFeatureKey[] = [
  "cycle_view",
  "module_view",
  "release_view",
  "issue_views_view",
  "page_view",
  "intake_view",
  "is_time_tracking_enabled",
  "is_issue_type_enabled",
  "review_view",
];

export type TDevMode = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  icon_props: TLogoProps;
  features: TDevModeFeatures;
  is_system: boolean;
  /** 阶段数 */
  stage_count: number;
  /** 该模式下所有阶段勾选的评审节点总数 */
  template_count: number;
  /** 引用这个模式的项目数。批次 3 给 Project 加外键前恒为 0 */
  project_count: number;
  created_at: string;
  updated_at: string;
};

/**
 * 挂在项目上的只读模式信息（`Project.dev_mode_detail`）。
 *
 * `features` 是「这个组件项目能不能开」的唯一依据：侧栏 tab 与项目设置的功能页都按
 * 「模式位 AND 项目位」算，别只看项目自己那一位。
 */
export type TDevModeLite = {
  id: string;
  name: string;
  icon_props: TLogoProps;
  features: TDevModeFeatures;
  is_system: boolean;
};

export type TDevModeStage = {
  id: string;
  dev_mode_id: string;
  stage_type_id: string;
  stage_type_detail: TStageTypeLite | null;
  /** 派生自阶段类型，只读 */
  code: string;
  name: string;
  /** 后端是 DecimalField，序列化成字符串 */
  workload_ratio: string | null;
  standard_days: number | null;
  sort_order: number;
  /** 这个阶段已勾选的评审节点数 */
  template_count: number;
  created_at: string;
  updated_at: string;
};

/**
 * 挂在评审实例上的只读阶段信息（``StageReview.stage_detail``）。
 *
 * ``label`` 是 ``name`` 的别名：这个字段原先指向 ``product_stage`` 字典值，前端读的是
 * ``label``，切到模式阶段后两个名字都给，消费方不必同一次全改。
 */
export type TDevModeStageLite = {
  id: string;
  name: string;
  label: string;
  code: string;
  sort_order: number;
};

/** 模式详情：列表字段 + 阶段 */
export type TDevModeDetail = TDevMode & {
  stages: TDevModeStage[];
};

/** 勾选面板里的一个评审树节点（评审 → 活动两层，靠 parent_id 建树） */
export type TDevModeStageTemplateNode = {
  id: string;
  parent_id: string | null;
  kind: string;
  title: string;
  initiator_role: string;
  leader_role: string;
  auditor_role: string;
  is_active: boolean;
  sort_order: number;
  selected: boolean;
};

export type TCreateDevModePayload = {
  name: string;
  description?: string;
  icon_props?: TLogoProps;
  features?: Partial<TDevModeFeatures>;
};

export type TUpdateDevModePayload = Partial<TCreateDevModePayload>;

export type TCreateDevModeStagePayload = {
  stage_type_id: string;
  name?: string;
  workload_ratio?: string | null;
  standard_days?: number | null;
};

export type TUpdateDevModeStagePayload = Partial<{
  name: string;
  workload_ratio: string | null;
  standard_days: number | null;
}>;

/** 批量新建的结果：created 是真建出来的，skipped 是已有同名阶段被跳过的 */
export type TDevModeStageBulkCreateResult = {
  created: number;
  skipped: number;
};

export type TDevModeErrorCode =
  | "DEV_MODE_NAME_REQUIRED"
  | "DEV_MODE_NAME_ALREADY_EXISTS"
  | "DEV_MODE_SYSTEM_NAME_READONLY"
  | "DEV_MODE_SYSTEM_PROTECTED"
  | "DEV_MODE_IN_USE"
  | "DEV_MODE_IN_USE_BY_INACTIVE_PROJECTS"
  | "DEV_MODE_FEATURES_INVALID"
  | "DEV_MODE_ICON_PROPS_INVALID"
  | "DEV_MODE_STAGE_NAME_REQUIRED"
  | "DEV_MODE_STAGE_NAME_ALREADY_EXISTS"
  | "DEV_MODE_STAGE_TYPE_WORKSPACE_MISMATCH"
  | "DEV_MODE_STAGE_TYPE_IMMUTABLE"
  | "DEV_MODE_STAGE_RATIO_OUT_OF_RANGE"
  | "DEV_MODE_STAGE_TEMPLATE_MISMATCH"
  | "DEV_MODE_STAGE_IN_USE";

/** 一个模式内所有阶段的工作量占比累计上限（与后端 MAX_WORKLOAD_RATIO_TOTAL 一致） */
export const DEV_MODE_MAX_WORKLOAD_RATIO = 100;

/**
 * 默认模式的名字（与后端 seed_data/dev_modes.py::DEFAULT_DEV_MODE_NAME 一致）。
 *
 * 它是组件全开的那一个，等价于加模式之前的现状：存量项目回填到它，创建项目弹窗也默认选它。
 * 预置模式不许改名就是为了这个 —— 改了这里和迁移都会落空。
 */
export const DEFAULT_DEV_MODE_NAME = "混合模式";
