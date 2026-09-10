import type {
  TActReviewTailoringPayload,
  TCreateReviewTailoringPayload,
  TReviewTailoring,
  TReviewTailoringActivity,
  TReviewTailoringCellPayload,
  TReviewTailoringComment,
  TReviewTailoringDetail,
  TSubmitReviewTailoringPayload,
  TUpdateReviewTailoringHeaderPayload,
} from "@plane/types";
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

/**
 * 评审裁剪：项目级资源，后端 project.review_tailoring.* 鉴权。
 *
 * 除了 list 与两个 feed 接口，其余方法都返回**完整的详情对象** —— 后端每个动作都
 * 把矩阵重新算一遍回给前端，调用方拿到就能整块替换本地状态，不用再补一次请求。
 */
export class ReviewTailoringService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/review-tailorings`;
  }

  /** 列表不带格子：一张表可能有几百个格子 */
  async list(workspaceSlug: string, projectId: string): Promise<TReviewTailoring[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, tailoringId: string): Promise<TReviewTailoringDetail> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${tailoringId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    payload: TCreateReviewTailoringPayload
  ): Promise<TReviewTailoringDetail> {
    return this.post(`${this.base(workspaceSlug, projectId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateHeader(
    workspaceSlug: string,
    projectId: string,
    tailoringId: string,
    payload: TUpdateReviewTailoringHeaderPayload
  ): Promise<TReviewTailoringDetail> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/${tailoringId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, tailoringId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/${tailoringId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 批量存勾选与裁剪原因。后端会做父子联动收敛，返回的是收敛后的结果 */
  async saveCells(
    workspaceSlug: string,
    projectId: string,
    tailoringId: string,
    cells: TReviewTailoringCellPayload[]
  ): Promise<TReviewTailoringDetail> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/${tailoringId}/cells/`, { cells })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addProducts(
    workspaceSlug: string,
    projectId: string,
    tailoringId: string,
    productIds: string[]
  ): Promise<TReviewTailoringDetail> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${tailoringId}/products/`, { product_ids: productIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async submit(
    workspaceSlug: string,
    projectId: string,
    tailoringId: string,
    payload: TSubmitReviewTailoringPayload
  ): Promise<TReviewTailoringDetail> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${tailoringId}/submit/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async withdraw(workspaceSlug: string, projectId: string, tailoringId: string): Promise<TReviewTailoringDetail> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${tailoringId}/withdraw/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async act(
    workspaceSlug: string,
    projectId: string,
    tailoringId: string,
    payload: TActReviewTailoringPayload
  ): Promise<TReviewTailoringDetail> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${tailoringId}/act/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async revise(workspaceSlug: string, projectId: string, tailoringId: string): Promise<TReviewTailoringDetail> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${tailoringId}/revise/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async cancelRevision(workspaceSlug: string, projectId: string, tailoringId: string): Promise<TReviewTailoringDetail> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${tailoringId}/cancel-revision/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listActivities(
    workspaceSlug: string,
    projectId: string,
    tailoringId: string
  ): Promise<TReviewTailoringActivity[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${tailoringId}/activities/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listComments(workspaceSlug: string, projectId: string, tailoringId: string): Promise<TReviewTailoringComment[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${tailoringId}/comments/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createComment(
    workspaceSlug: string,
    projectId: string,
    tailoringId: string,
    payload: { comment_html: string; comment_json?: Record<string, unknown> }
  ): Promise<TReviewTailoringComment> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${tailoringId}/comments/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteComment(
    workspaceSlug: string,
    projectId: string,
    tailoringId: string,
    commentId: string
  ): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/${tailoringId}/comments/${commentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
