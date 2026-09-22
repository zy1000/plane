import { API_BASE_URL } from "@plane/constants";
import type { TCreateStageTypePayload, TStageType, TUpdateStageTypePayload } from "@plane/types";
import { APIService } from "@/services/api.service";

/** 工作区级阶段类型。列表一次返回全部（十来条），已按 sort_order 排好。 */
export class StageTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TStageType[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/stage-types/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: TCreateStageTypePayload): Promise<TStageType> {
    return this.post(`/api/workspaces/${workspaceSlug}/stage-types/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, stageTypeId: string, payload: TUpdateStageTypePayload): Promise<TStageType> {
    return this.patch(`/api/workspaces/${workspaceSlug}/stage-types/${stageTypeId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteStageType(workspaceSlug: string, stageTypeId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/stage-types/${stageTypeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 整段重排：传工作区内完整的有序 id 列表 */
  async reorder(workspaceSlug: string, stageTypeIds: string[]): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/stage-types/reorder/`, { stage_type_ids: stageTypeIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
