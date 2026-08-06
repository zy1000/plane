import { API_BASE_URL } from "@plane/constants";
import type {
  TCreateRequirementLibraryPayload,
  TRequirement,
  TRequirementApprovalAction,
  TRequirementBaselineConfiguration,
  TRequirementBaselineConfigurationPayload,
  TRequirementBatchSavePayload,
  TRequirementBatchSaveResponse,
  TRequirementChangeItemsResponse,
  TRequirementChangeRequest,
  TRequirementChangeRequestDetail,
  TRequirementChangeRequestsResponse,
  TRequirementChangeStatus,
  TRequirementChangeType,
  TRequirementData,
  TRequirementDiscardDraftResponse,
  TRequirementFilter,
  TRequirementImportPayload,
  TRequirementImportResponse,
  TRequirementLibrary,
  TRequirementLibraryConfiguration,
  TRequirementsResponse,
  TRequirementVersionComparisonResponse,
  TRequirementVersionDetail,
  TRequirementVersionRequirementsResponse,
  TRequirementVersionsResponse,
  TRequirementWorkingCopyResponse,
  TUpdateRequirementLibraryPayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class RequirementService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** 产品需求条目的作用域前缀 */
  private requirementsRoot(workspaceSlug: string, productId: string) {
    return `/api/workspaces/${workspaceSlug}/products/${productId}/requirements`;
  }

  /** 基线（审批配置 / 工作副本 / 变更单 / 版本）的作用域前缀 */
  private baselineRoot(workspaceSlug: string, productId: string) {
    return `/api/workspaces/${workspaceSlug}/products/${productId}/requirement-baseline`;
  }

  /* --- 需求标准库 ------------------------------------------------------- */

  async listLibraries(workspaceSlug: string): Promise<TRequirementLibrary[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-libraries/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getLibrary(workspaceSlug: string, libraryId: string): Promise<TRequirementLibrary> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createLibrary(workspaceSlug: string, payload: TCreateRequirementLibraryPayload): Promise<TRequirementLibrary> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirement-libraries/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateLibrary(
    workspaceSlug: string,
    libraryId: string,
    payload: TUpdateRequirementLibraryPayload
  ): Promise<TRequirementLibrary> {
    return this.patch(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteLibrary(workspaceSlug: string, libraryId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getLibraryConfiguration(
    workspaceSlug: string,
    libraryId: string
  ): Promise<TRequirementLibraryConfiguration> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/configuration/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listLibraryItems(
    workspaceSlug: string,
    libraryId: string,
    params: {
      cursor?: string;
      perPage?: number;
      search?: string;
      filters?: TRequirementFilter[];
      /** 按 id 直取，供父项选择器回显不在当前页的行 */
      ids?: string[];
    } = {}
  ): Promise<TRequirementsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.filters?.length ? { filters: JSON.stringify(params.filters) } : {}),
        ...(params.ids?.length ? { ids: params.ids.join(",") } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createLibraryItem(
    workspaceSlug: string,
    libraryId: string,
    payload: {
      data: TRequirementData;
      before_id?: string;
      after_id?: string;
    }
  ): Promise<TRequirement> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateLibraryItem(
    workspaceSlug: string,
    libraryId: string,
    itemId: string,
    payload: { data: TRequirementData; version: number }
  ): Promise<TRequirement> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/${itemId}/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteLibraryItem(workspaceSlug: string, libraryId: string, itemId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/${itemId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkDeleteLibraryItems(workspaceSlug: string, libraryId: string, itemIds: string[]): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/bulk-delete/`, {
      ids: itemIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkSaveLibraryItems(
    workspaceSlug: string,
    libraryId: string,
    payload: TRequirementBatchSavePayload
  ): Promise<TRequirementBatchSaveResponse> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/bulk-save/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 基线配置 --------------------------------------------------------- */

  /** 基线由后端惰性创建，所以 GET 一定拿得到一份（哪怕是空态） */
  async getBaseline(workspaceSlug: string, productId: string): Promise<TRequirementBaselineConfiguration> {
    return this.get(`${this.baselineRoot(workspaceSlug, productId)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateBaseline(
    workspaceSlug: string,
    productId: string,
    payload: TRequirementBaselineConfigurationPayload
  ): Promise<TRequirementBaselineConfiguration> {
    return this.put(`${this.baselineRoot(workspaceSlug, productId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 产品需求条目 ------------------------------------------------------ */

  async listRequirements(
    workspaceSlug: string,
    productId: string,
    params: {
      cursor?: string;
      perPage?: number;
      search?: string;
      filters?: TRequirementFilter[];
      /** 按需求类型切视图必须走服务端过滤 —— 条目是游标分页的 */
      requirementTypeId?: string;
      /** 按 id 直取，供父项选择器回显不在当前页的行 */
      ids?: string[];
    } = {}
  ): Promise<TRequirementsResponse> {
    return this.get(`${this.requirementsRoot(workspaceSlug, productId)}/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.filters?.length ? { filters: JSON.stringify(params.filters) } : {}),
        ...(params.requirementTypeId ? { requirement_type_id: params.requirementTypeId } : {}),
        ...(params.ids?.length ? { ids: params.ids.join(",") } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRequirement(
    workspaceSlug: string,
    productId: string,
    payload: {
      data: TRequirementData;
      /** 新行绑定哪个需求类型 —— 字段与校验都以它为准 */
      requirement_type_id: string;
      before_id?: string;
      after_id?: string;
    }
  ): Promise<TRequirement> {
    return this.post(`${this.requirementsRoot(workspaceSlug, productId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 从标准库导入条目，成为本产品下绑定该库需求类型的需求 */
  async importLibraryItems(
    workspaceSlug: string,
    productId: string,
    payload: TRequirementImportPayload
  ): Promise<TRequirementImportResponse> {
    return this.post(`${this.requirementsRoot(workspaceSlug, productId)}/import/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRequirement(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    payload: { data: TRequirementData; version: number }
  ): Promise<TRequirement> {
    return this.patch(`${this.requirementsRoot(workspaceSlug, productId)}/${requirementId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRequirement(workspaceSlug: string, productId: string, requirementId: string): Promise<void> {
    return this.delete(`${this.requirementsRoot(workspaceSlug, productId)}/${requirementId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkDeleteRequirements(
    workspaceSlug: string,
    productId: string,
    requirementIds: string[]
  ): Promise<void> {
    return this.post(`${this.requirementsRoot(workspaceSlug, productId)}/bulk-delete/`, {
      ids: requirementIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkSaveRequirements(
    workspaceSlug: string,
    productId: string,
    payload: TRequirementBatchSavePayload
  ): Promise<TRequirementBatchSaveResponse> {
    return this.post(`${this.requirementsRoot(workspaceSlug, productId)}/bulk-save/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 工作副本 --------------------------------------------------------- */

  /** 对应「编辑」按钮：已发布内容克隆出工作副本，基线状态置为草稿 */
  async startEditing(workspaceSlug: string, productId: string): Promise<TRequirementWorkingCopyResponse> {
    return this.post(`${this.baselineRoot(workspaceSlug, productId)}/working-copy/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 对应「撤回草稿」：从未发布则清空条目，否则恢复到上一个已发布版本 */
  async discardDraft(workspaceSlug: string, productId: string): Promise<TRequirementDiscardDraftResponse> {
    return this.delete(`${this.baselineRoot(workspaceSlug, productId)}/working-copy/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 变更单 ----------------------------------------------------------- */

  async listChangeRequests(
    workspaceSlug: string,
    productId: string,
    params: { cursor?: string; perPage?: number; status?: TRequirementChangeStatus } = {}
  ): Promise<TRequirementChangeRequestsResponse> {
    return this.get(`${this.baselineRoot(workspaceSlug, productId)}/change-requests/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getChangeRequest(
    workspaceSlug: string,
    productId: string,
    changeRequestId: string
  ): Promise<TRequirementChangeRequestDetail> {
    return this.get(`${this.baselineRoot(workspaceSlug, productId)}/change-requests/${changeRequestId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 需求条目组的变更项：千行量级下必须分页 */
  async listChangeItems(
    workspaceSlug: string,
    productId: string,
    changeRequestId: string,
    params: {
      cursor?: string;
      perPage?: number;
      changeType?: TRequirementChangeType;
      requirementTypeId?: string;
    } = {}
  ): Promise<TRequirementChangeItemsResponse> {
    return this.get(
      `${this.baselineRoot(workspaceSlug, productId)}/change-requests/${changeRequestId}/items/`,
      {
        params: {
          ...(params.cursor ? { cursor: params.cursor } : {}),
          ...(params.perPage ? { per_page: params.perPage } : {}),
          ...(params.changeType ? { change_type: params.changeType } : {}),
          ...(params.requirementTypeId ? { requirement_type_id: params.requirementTypeId } : {}),
        },
      }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async submitChangeRequest(
    workspaceSlug: string,
    productId: string,
    payload: { reason: string }
  ): Promise<TRequirementChangeRequest> {
    return this.post(`${this.baselineRoot(workspaceSlug, productId)}/change-requests/submit/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async actOnChangeRequest(
    workspaceSlug: string,
    productId: string,
    changeRequestId: string,
    payload: { action: TRequirementApprovalAction; comment?: string }
  ): Promise<TRequirementChangeRequest> {
    return this.post(
      `${this.baselineRoot(workspaceSlug, productId)}/change-requests/${changeRequestId}/act/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async cancelChangeRequest(
    workspaceSlug: string,
    productId: string,
    changeRequestId: string
  ): Promise<TRequirementChangeRequest> {
    return this.post(
      `${this.baselineRoot(workspaceSlug, productId)}/change-requests/${changeRequestId}/cancel/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 版本 ------------------------------------------------------------- */

  async listVersions(
    workspaceSlug: string,
    productId: string,
    params: { cursor?: string; perPage?: number } = {}
  ): Promise<TRequirementVersionsResponse> {
    return this.get(`${this.baselineRoot(workspaceSlug, productId)}/versions/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getVersion(
    workspaceSlug: string,
    productId: string,
    version: number
  ): Promise<TRequirementVersionDetail> {
    return this.get(`${this.baselineRoot(workspaceSlug, productId)}/versions/${version}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 版本快照的 requirements 数组在服务端切片，避免整份返回 */
  async listVersionRequirements(
    workspaceSlug: string,
    productId: string,
    version: number,
    params: { cursor?: string; perPage?: number; requirementTypeId?: string } = {}
  ): Promise<TRequirementVersionRequirementsResponse> {
    return this.get(`${this.baselineRoot(workspaceSlug, productId)}/versions/${version}/requirements/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.requirementTypeId ? { requirement_type_id: params.requirementTypeId } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 任意两版对比：toVersion 缺省时由服务端回退为当前已发布版本 */
  async compareVersions(
    workspaceSlug: string,
    productId: string,
    version: number,
    params: {
      toVersion?: number;
      cursor?: string;
      perPage?: number;
      changeType?: TRequirementChangeType;
      requirementTypeId?: string;
    } = {}
  ): Promise<TRequirementVersionComparisonResponse> {
    return this.get(`${this.baselineRoot(workspaceSlug, productId)}/versions/${version}/compare/`, {
      params: {
        ...(params.toVersion ? { to_version: params.toVersion } : {}),
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.changeType ? { change_type: params.changeType } : {}),
        ...(params.requirementTypeId ? { requirement_type_id: params.requirementTypeId } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 回滚只是把历史快照灌入工作副本，仍需提交审批才会生效 */
  async rollbackToVersion(
    workspaceSlug: string,
    productId: string,
    version: number
  ): Promise<TRequirementWorkingCopyResponse> {
    return this.post(`${this.baselineRoot(workspaceSlug, productId)}/versions/${version}/rollback/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
