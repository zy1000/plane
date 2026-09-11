// plane imports
import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";


/** 当前用户在这条用例上的身份：不是本条评审人时为 null */
export type ReviewCaseMineState = "todo" | "done" | null;

export type ReviewCaseListItem = {
  id: string;
  case_id: string;
  code?: string;
  name: string;
  priority: number;
  result: string;
  created_by: string | null;
  repository?: string | null;
  module?: string | null;
  suggestion_count: number;
  /** 本条用例的评审人（用例级）。卡片列表用 slim=true 拉取时不下发 */
  assignees?: string[];
  mine: ReviewCaseMineState;
  /** 待评审人头像用，服务端最多下发 5 个；真实待评审人数看 reviewer_count - reviewed_count */
  pending_assignees: string[];
  reviewed_count: number;
  reviewer_count: number;
};

export class CaseService extends APIService {
  constructor() {
    super(API_BASE_URL);
   }

  async getReviewList(workspaceSlug: string, queries?: any): Promise<Array<{ id: string; name: string }>> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/review/list/`, { params: queries })
      .then((response) => response?.data || [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

   async createReviewModule(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/review/module/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async getReviewModules(workspaceSlug: string, projectId: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/review/module/`, {
      params: { project_id: projectId, ...(queries || {}) },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteReviewModule(workspaceSlug: string, data: { ids: string[] }): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/review/module/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateReviewModule(workspaceSlug: string, moduleId: string, data: any): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/test/review/module/${moduleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

    //获取评审枚举值
    async getReviewEnums(workspaceSlug: string): Promise<any> {
      return this.get(`/api/workspaces/${workspaceSlug}/test/review/enums/`)
        .then((response) => response?.data)
        .catch((error) => {
            throw error?.response?.data;
        });
  }

  async getReviews(workspaceSlug: string, projectId: string, queries?: any): Promise<{ data: any[]; count: number }> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/review/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createReview(workspaceSlug: string, projectId: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/review/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateReview(workspaceSlug: string, projectId: string, data: any): Promise<any> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/review/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteReview(workspaceSlug: string, projectId: string, data: { ids: string[] }): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/review/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReviewCaseList(
    workspaceSlug: string,
    review_id: string,
    queries?: {
      all?: boolean;
      /** 只要卡片用得到的字段，不下发每行的评审人 id */
      slim?: boolean;
      page?: number;
      page_size?: number;
      project_id?: string | null;
      repository_id?: string | null;
      repository_ids?: string | null;
      module_id?: string | null;
      module_ids?: string | null;
      ordering?: string;
      name__icontains?: string;
      result__in?: string;
      priority__in?: string;
      assignee__in?: string;
    }
  ): Promise<{ data: ReviewCaseListItem[]; count: number }> {
    const params = { review_id, ...(queries || {}) } as any;
    return this.get(`/api/workspaces/${workspaceSlug}/test/review/case-list/`, { params })
      .then((response) => ({ data: response?.data.data ?? [], count: Number(response?.data.count || 0) }))
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async CaseCancel(workspaceSlug: string, projectId: string, data: { ids: string[] }): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/review/cancel-case/`, data, { params: { project_id: projectId } })
      .then(() => {})
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addReviewCases(
    workspaceSlug: string,
    projectId: string,
    data: { review_id: string; case_ids: string[]; assignees?: string[] }
  ): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/review/add-cases/`, data, { params: { project_id: projectId } })
      .then(() => {})
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 整体覆盖一批评审用例的评审人；ids 传一条即行内编辑，传多条即批量设置 */
  async updateReviewCaseAssignees(
    workspaceSlug: string,
    projectId: string,
    data: { review_id: string; ids: string[]; assignees: string[] }
  ): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/review/case-assignees/`, data, {
      params: { project_id: projectId },
    })
      .then(() => {})
      .catch((error) => {
        throw error?.response?.data;
      });
  }

    async getRecords(workspaceSlug: string, review_id: string, case_id: string): Promise<any> {
    const query = {review_id, case_id}
    return this.get(`/api/workspaces/${workspaceSlug}/test/review/records/`, {params: query})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async confirmRecord(workspaceSlug: string, record_id: string): Promise<void> {
    const params = { record_id };
    return this.put(`/api/workspaces/${workspaceSlug}/test/review/confirm/`, undefined, { params })
      .then(() => {})
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRecord(workspaceSlug: string, record_id: string): Promise<void> {
    const params = { record_id };
    return this.delete(`/api/workspaces/${workspaceSlug}/test/review/delete-record/`, undefined, { params })
      .then(() => {})
      .catch((error) => {
        throw error?.response?.data;
      });
  }

}
