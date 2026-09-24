import type { TStageTypeLite } from "./stage-type";
import type { IUserLite } from "./users";

/**
 * 项目阶段（PMS-101，替代原里程碑模块）：项目自己的一份阶段列表，创建项目时从研发模式带出，
 * 之后项目内可增删改、加子阶段。「里程碑」是阶段上的 `is_milestone` 标记。
 *
 * - 占比只算叶子：有子阶段的阶段 `workload_ratio` 恒为 null，`computed_workload_ratio` 是子之和。
 * - 状态四态下拉直接改；「已延期」`is_delayed` 由后端按「计划结束早于今天且未完成」算出。
 * - `parent_id` 创建后不可改；带 `source_stage_id` 的阶段不能改类型。
 */

export enum EProjectStageStatus {
  NOT_STARTED = "not_started",
  IN_PROGRESS = "in_progress",
  PAUSED = "paused",
  COMPLETED = "completed",
}

export const PROJECT_STAGE_STATUSES: EProjectStageStatus[] = [
  EProjectStageStatus.NOT_STARTED,
  EProjectStageStatus.IN_PROGRESS,
  EProjectStageStatus.PAUSED,
  EProjectStageStatus.COMPLETED,
];

export const PROJECT_STAGE_MAX_WORKLOAD_RATIO = 100;

export type TProjectStage = {
  id: string;
  project_id: string;
  stage_type_id: string;
  stage_type_detail: TStageTypeLite | null;
  /** 派生自阶段类型，只读 */
  code: string;
  name: string;
  description: string;
  is_milestone: boolean;
  parent_id: string | null;
  owner_id: string | null;
  owner_detail: IUserLite | null;
  /** DecimalField 序列化为字符串；有子阶段时为 null */
  workload_ratio: string | null;
  /** 父 = 子之和，叶 = 自身 */
  computed_workload_ratio: string | null;
  start_date: string | null;
  end_date: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: EProjectStageStatus;
  is_delayed: boolean;
  sort_order: number;
  source_stage_id: string | null;
  children_count: number;
  /** 挂在这个阶段上的活跃评审数（PMS-101 第二期），阶段页行尾小标 */
  review_count: number;
  created_at: string;
  updated_at: string;
};

/** 挂在评审实例上的只读阶段信息（`StageReview.stage_detail`）。`label` 是 `name` 的别名 */
export type TProjectStageLite = {
  id: string;
  name: string;
  label: string;
  code: string;
  sort_order: number;
  parent_id: string | null;
  stage_type_id: string;
};

export type TCreateProjectStagePayload = {
  stage_type_id: string;
  name?: string;
  description?: string;
  is_milestone?: boolean;
  parent_id?: string | null;
  owner_id?: string | null;
  workload_ratio?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: EProjectStageStatus;
};

export type TUpdateProjectStagePayload = Partial<Omit<TCreateProjectStagePayload, "parent_id">> & {
  actual_start?: string | null;
  actual_end?: string | null;
};

/** 批量改属性：undefined = 保持不变，null = 清空 */
export type TProjectStageBulkChanges = {
  owner?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type TBulkUpdateProjectStagePayload = TProjectStageBulkChanges & { stage_ids: string[] };

export type TBulkUpdateProjectStageResponse = {
  updated: number;
  failed: { id: string; name: string; code: string; error: string }[];
  stages: TProjectStage[];
};

export type TSyncProjectStagesResponse = {
  created: TProjectStage[];
  /** 已按 source_stage 带出过的模式阶段 id */
  skipped: string[];
  /** 同类型同名、视为已带出的模式阶段 id */
  matched_by_name: string[];
  /** 因占比会超 100 而被置空占比的阶段名 */
  ratio_dropped: string[];
};
