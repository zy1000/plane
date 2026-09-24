import type {
  TBulkUpdateProjectStagePayload,
  TBulkUpdateProjectStageResponse,
  TCreateProjectStagePayload,
  TProjectStage,
  TSyncProjectStagesResponse,
  TUpdateProjectStagePayload,
} from "@plane/types";
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

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

  /** 把项目研发模式里还没带出的阶段补进来；`stageIds` 是勾选的模式阶段 id，不传就全补 */
  async syncFromDevMode(
    workspaceSlug: string,
    projectId: string,
    stageIds?: string[]
  ): Promise<TSyncProjectStagesResponse> {
    return this.post(`${this.base(workspaceSlug, projectId)}/sync-from-dev-mode/`, stageIds ? { stage_ids: stageIds } : {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
