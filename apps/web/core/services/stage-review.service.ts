import type {
  TCreateStageReviewPayload,
  TFileSignedURLResponse,
  TStageReview,
  TStageReviewActivity,
  TStageReviewAttachment,
  TStageReviewCandidates,
  TStageReviewComment,
  TStageReviewDetail,
  TStageReviewStageSummary,
  TSubmitStageReviewPayload,
  TUpdateStageReviewPayload,
} from "@plane/types";
import { API_BASE_URL } from "@plane/constants";
import { FileUploadService, generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import { APIService } from "@/services/api.service";

/**
 * 阶段评审实例：项目级资源，后端 project.stage_review.* 鉴权。
 *
 * 状态没有「改成某个状态」的接口，只有 advance（往前一步）与 rollback（退回一步），
 * 从哪到哪由后端状态机决定。两者与 update 一样返回**完整详情**，调用方整块替换本地
 * 状态，不用再补一次请求。
 */
export class StageReviewService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/stage-reviews`;
  }

  /** 左栏：有评审的阶段 + 完成进度 */
  async listStages(workspaceSlug: string, projectId: string): Promise<TStageReviewStageSummary[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/stages/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 一个阶段下的全部评审，扁平返回（产品分组与层级缩进在前端做） */
  async list(workspaceSlug: string, projectId: string, stageId?: string): Promise<TStageReview[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/`, { params: stageId ? { stage_id: stageId } : {} })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, reviewId: string): Promise<TStageReviewDetail> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${reviewId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    payload: TCreateStageReviewPayload
  ): Promise<TStageReviewDetail> {
    return this.post(`${this.base(workspaceSlug, projectId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    reviewId: string,
    payload: TUpdateStageReviewPayload
  ): Promise<TStageReviewDetail> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/${reviewId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, reviewId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/${reviewId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 推进一步。评审中 → 审核中 这一跳要带结论，其余两跳不用带 */
  async advance(
    workspaceSlug: string,
    projectId: string,
    reviewId: string,
    payload?: TSubmitStageReviewPayload
  ): Promise<TStageReviewDetail> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${reviewId}/advance/`, payload ?? {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 退回上一步。只回一步 */
  async rollback(workspaceSlug: string, projectId: string, reviewId: string): Promise<TStageReviewDetail> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${reviewId}/rollback/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 负责人 / 审核者的候选人，按产品的角色配置筛 */
  async listCandidates(
    workspaceSlug: string,
    projectId: string,
    reviewId: string,
    role: "leader" | "auditor"
  ): Promise<TStageReviewCandidates> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${reviewId}/candidates/`, { params: { role } })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listActivities(workspaceSlug: string, projectId: string, reviewId: string): Promise<TStageReviewActivity[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${reviewId}/activities/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listComments(workspaceSlug: string, projectId: string, reviewId: string): Promise<TStageReviewComment[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${reviewId}/comments/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createComment(
    workspaceSlug: string,
    projectId: string,
    reviewId: string,
    payload: { comment_html: string }
  ): Promise<TStageReviewComment> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${reviewId}/comments/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteComment(workspaceSlug: string, projectId: string, reviewId: string, commentId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/${reviewId}/comments/${commentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- 附件：两步预签名上传，口径同迭代附件 ---------------------------------

  async listFiles(workspaceSlug: string, projectId: string, reviewId: string): Promise<TStageReviewAttachment[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${reviewId}/files/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 三步走：换预签名地址 → 直传 S3/MinIO → 回来把这条资产标成已上传。
   *
   * 中间那步是浏览器直接 POST 到对象存储的，不经过 Django —— 所以标记这一步不能省，
   * 省了列表就永远看不到这个附件（后端只列 is_uploaded 的行）。
   */
  async uploadFile(
    workspaceSlug: string,
    projectId: string,
    reviewId: string,
    file: File
  ): Promise<TStageReviewAttachment> {
    const metadata = await getFileMetaDataForUpload(file);
    const credentials = await this.post(`${this.base(workspaceSlug, projectId)}/${reviewId}/files/`, metadata)
      .then((response) => response?.data as { upload_data: TFileSignedURLResponse["upload_data"]; asset_id: string })
      .catch((error) => {
        throw error?.response?.data;
      });

    const payload = generateFileUploadPayload(
      { upload_data: credentials.upload_data, asset_id: credentials.asset_id, asset_url: "" } as TFileSignedURLResponse,
      file
    );
    await new FileUploadService().uploadFile(credentials.upload_data.url, payload);

    return this.patch(`${this.base(workspaceSlug, projectId)}/${reviewId}/files/${credentials.asset_id}/uploaded/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteFile(workspaceSlug: string, projectId: string, reviewId: string, assetId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/${reviewId}/files/${assetId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 下载走后端换预签名地址，再由浏览器直接取对象 */
  async getFileDownloadUrl(
    workspaceSlug: string,
    projectId: string,
    reviewId: string,
    assetId: string
  ): Promise<string> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${reviewId}/files/${assetId}/download/`)
      .then((response) => response?.data?.download_url)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
