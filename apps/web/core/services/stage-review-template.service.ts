import type {
  TCreateStageReviewTemplatePayload,
  TStageReviewTemplate,
  TUpdateStageReviewTemplatePayload,
} from "@plane/types";
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

/** 评审模板库：工作区级资源，后端 workspace.review_template.* 鉴权 */
export class StageReviewTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** 全量返回，不分页（几十行），前端按阶段分组 + 按 parent 建树 */
  async list(workspaceSlug: string): Promise<TStageReviewTemplate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/stage-review-templates/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: TCreateStageReviewTemplatePayload): Promise<TStageReviewTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/stage-review-templates/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    templateId: string,
    payload: TUpdateStageReviewTemplatePayload
  ): Promise<TStageReviewTemplate> {
    return this.patch(`/api/workspaces/${workspaceSlug}/stage-review-templates/${templateId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, templateId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/stage-review-templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 整段重排：传同一分组（同阶段同父）内的完整有序 id 列表 */
  async reorder(workspaceSlug: string, templateIds: string[]): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/stage-review-templates/reorder/`, {
      template_ids: templateIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
