import type {
  TBulkUpdateProjectStagePayload,
  TBulkUpdateProjectStageResponse,
  TCreateProjectStagePayload,
  TProjectStage,
  TStateGroups,
  TSyncProjectStagesResponse,
  TUpdateProjectStagePayload,
} from "@plane/types";
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

/** 规划视图里的迭代：起止、测试移交日期已按项目时区折成 YYYY-MM-DD（移交日期后端要求落在起止之间） */
export type TProjectStagePlanCycle = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  test_handoff_date: string | null;
  stage_id: string | null;
  owned_by_id: string | null;
};

/** 规划视图里的工作项：`cycle_id` 只认未归档的迭代；`assignee_ids` 按指定先后 */
export type TProjectStagePlanIssue = {
  id: string;
  name: string;
  sequence_id: number;
  stage_id: string | null;
  cycle_id: string | null;
  start_date: string | null;
  target_date: string | null;
  state_group: TStateGroups;
  assignee_ids: string[];
};

export type TProjectStagePlanData = {
  cycles: TProjectStagePlanCycle[];
  issues: TProjectStagePlanIssue[];
};

/**
 * 项目阶段：项目级资源，后端 project.stage.* 鉴权。列表整棵一次返回（扁平，前端按 parent_id 建树）。
 * 状态没有 action 端点，直接 PATCH `status`，实际日期的填 / 清由后端按状态切换处理。
 */
export class ProjectStageService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/stages`;
  }

  async list(workspaceSlug: string, projectId: string): Promise<TProjectStage[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, payload: TCreateProjectStagePayload): Promise<TProjectStage> {
    return this.post(`${this.base(workspaceSlug, projectId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    stageId: string,
    payload: TUpdateProjectStagePayload
  ): Promise<TProjectStage> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/${stageId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, stageId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/${stageId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkUpdate(
    workspaceSlug: string,
    projectId: string,
    payload: TBulkUpdateProjectStagePayload
  ): Promise<TBulkUpdateProjectStageResponse> {
    return this.post(`${this.base(workspaceSlug, projectId)}/bulk-update/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 把勾选的研发模式阶段再带一份进项目；`stageIds` 是模式阶段 id，已带出过的也照样新建 */
  async syncFromDevMode(
    workspaceSlug: string,
    projectId: string,
    stageIds: string[]
  ): Promise<TSyncProjectStagesResponse> {
    return this.post(`${this.base(workspaceSlug, projectId)}/sync-from-dev-mode/`, { stage_ids: stageIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 规划视图（阶段 › 迭代 › 工作项）要的迭代和工作项；阶段本身走 list */
  async getPlan(workspaceSlug: string, projectId: string): Promise<TProjectStagePlanData> {
    return this.get(`${this.base(workspaceSlug, projectId)}/plan/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
