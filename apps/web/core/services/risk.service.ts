import type {
  TCreateRiskCommentPayload,
  TCreateRiskPayload,
  TFileSignedURLResponse,
  TRisk,
  TRiskActivity,
  TRiskAttachment,
  TRiskComment,
  TRiskDetail,
  TRiskLinkedIssue,
  TUpdateRiskPayload,
} from "@plane/types";
import { API_BASE_URL } from "@plane/constants";
import { FileUploadService, generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import { APIService } from "@/services/api.service";

/**
 * 项目风险：项目级资源，后端按项目成员角色鉴权（成员可写、访客只读）。
 *
 * create / update 都返回**完整详情**（含三段富文本），调用方整块替换本地状态。
 * `risk_level` 由后端按影响程度 × 发生概率算出，payload 里传了也会被忽略。
 */
export class RiskService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/risks`;
  }

  private issueBase(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/risks`;
  }

  async list(workspaceSlug: string, projectId: string): Promise<TRisk[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 新建弹窗里展示的预计编号（不占号；有人先建了，保存时拿到的会顺延） */
  async getNextCode(workspaceSlug: string, projectId: string): Promise<string> {
    return this.get(`${this.base(workspaceSlug, projectId)}/next-code/`)
      .then((response) => response?.data?.code)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, riskId: string): Promise<TRiskDetail> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${riskId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, payload: TCreateRiskPayload): Promise<TRiskDetail> {
    return this.post(`${this.base(workspaceSlug, projectId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    riskId: string,
    payload: TUpdateRiskPayload
  ): Promise<TRiskDetail> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/${riskId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, riskId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/${riskId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- 关联缺陷（风险侧） ----------------------------------------------------

  async listIssues(workspaceSlug: string, projectId: string, riskId: string): Promise<TRiskLinkedIssue[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${riskId}/issues/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 全有或全无：有一个不是本项目的缺陷整次失败（code=RISK_ISSUE_NOT_DEFECT）。返回关联后的全量列表 */
  async linkIssues(
    workspaceSlug: string,
    projectId: string,
    riskId: string,
    issueIds: string[]
  ): Promise<TRiskLinkedIssue[]> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${riskId}/issues/`, { issue_ids: issueIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unlinkIssue(workspaceSlug: string, projectId: string, riskId: string, issueId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/${riskId}/issues/${issueId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- 关联风险（缺陷侧） ----------------------------------------------------

  async listIssueRisks(workspaceSlug: string, projectId: string, issueId: string): Promise<TRisk[]> {
    return this.get(`${this.issueBase(workspaceSlug, projectId, issueId)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async linkRisksToIssue(workspaceSlug: string, projectId: string, issueId: string, riskIds: string[]): Promise<TRisk[]> {
    return this.post(`${this.issueBase(workspaceSlug, projectId, issueId)}/`, { risk_ids: riskIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unlinkRiskFromIssue(workspaceSlug: string, projectId: string, issueId: string, riskId: string): Promise<void> {
    return this.delete(`${this.issueBase(workspaceSlug, projectId, issueId)}/${riskId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- 评论 / 变更历史 -----------------------------------------------------------

  async listComments(workspaceSlug: string, projectId: string, riskId: string): Promise<TRiskComment[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${riskId}/comments/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createComment(
    workspaceSlug: string,
    projectId: string,
    riskId: string,
    payload: TCreateRiskCommentPayload
  ): Promise<TRiskComment> {
    return this.post(`${this.base(workspaceSlug, projectId)}/${riskId}/comments/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 只有作者本人能删，其他人 403 */
  async deleteComment(workspaceSlug: string, projectId: string, riskId: string, commentId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/${riskId}/comments/${commentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listActivities(workspaceSlug: string, projectId: string, riskId: string): Promise<TRiskActivity[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${riskId}/activities/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- 附件：两步预签名上传，口径同阶段评审附件 ---------------------------------

  async listFiles(workspaceSlug: string, projectId: string, riskId: string): Promise<TRiskAttachment[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${riskId}/files/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 换预签名地址 → 直传 S3/MinIO → 标成已上传。最后一步不能省，后端只列 is_uploaded 的行 */
  async uploadFile(
    workspaceSlug: string,
    projectId: string,
    riskId: string,
    file: File,
    onProgress?: (percentage: number) => void
  ): Promise<TRiskAttachment> {
    const metadata = await getFileMetaDataForUpload(file);
    const credentials = await this.post(`${this.base(workspaceSlug, projectId)}/${riskId}/files/`, metadata)
      .then((response) => response?.data as { upload_data: TFileSignedURLResponse["upload_data"]; asset_id: string })
      .catch((error) => {
        throw error?.response?.data;
      });

    const payload = generateFileUploadPayload(
      { upload_data: credentials.upload_data, asset_id: credentials.asset_id, asset_url: "" } as TFileSignedURLResponse,
      file
    );
    await new FileUploadService().uploadFile(credentials.upload_data.url, payload, (event) => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    });

    return this.patch(`${this.base(workspaceSlug, projectId)}/${riskId}/files/${credentials.asset_id}/uploaded/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteFile(workspaceSlug: string, projectId: string, riskId: string, assetId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/${riskId}/files/${assetId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getFileDownloadUrl(workspaceSlug: string, projectId: string, riskId: string, assetId: string): Promise<string> {
    return this.get(`${this.base(workspaceSlug, projectId)}/${riskId}/files/${assetId}/download/`)
      .then((response) => response?.data?.download_url)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
