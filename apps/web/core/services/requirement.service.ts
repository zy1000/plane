import { API_BASE_URL } from "@plane/constants";
import type {
  TCreateProductRequirementPayload,
  TCreateRequirementLibraryPayload,
  TRequirement,
  TRequirementApprovalAction,
  TRequirementChangeItemsResponse,
  TRequirementChangeRequest,
  TRequirementChangeRequestDetail,
  TRequirementChangeRequestsResponse,
  TRequirementChangeStatus,
  TRequirementChangeType,
  TRequirementConfiguration,
  TRequirementConfigurationPayload,
  TRequirementDetail,
  TRequirementDetailBatchSavePayload,
  TRequirementDetailBatchSaveResponse,
  TRequirementDetailData,
  TRequirementDetailFilter,
  TRequirementDetailImportPayload,
  TRequirementDetailImportResponse,
  TRequirementDetailsResponse,
  TRequirementDiscardDraftResponse,
  TRequirementLibrary,
  TRequirementLibraryConfiguration,
  TRequirementVersionComparisonResponse,
  TRequirementVersionDetail,
  TRequirementVersionDetailsResponse,
  TRequirementVersionsResponse,
  TRequirementWorkingCopyResponse,
  TUpdateProductRequirementPayload,
  TUpdateRequirementLibraryPayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class RequirementService extends APIService {
  constructor() {
    super(API_BASE_URL);
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

  /* --- 标准库条目 ------------------------------------------------------- */

  /** 条目网格的表头：库信息 + 字段树。字段来自库所选模板，只读。 */
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
      filters?: TRequirementDetailFilter[];
    } = {}
  ): Promise<TRequirementDetailsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.filters?.length ? { filters: JSON.stringify(params.filters) } : {}),
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
      data: TRequirementDetailData;
      before_id?: string;
      after_id?: string;
    }
  ): Promise<TRequirementDetail> {
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
    payload: { data: TRequirementDetailData; version: number }
  ): Promise<TRequirementDetail> {
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
    payload: TRequirementDetailBatchSavePayload
  ): Promise<TRequirementDetailBatchSaveResponse> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/bulk-save/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listProductRequirements(workspaceSlug: string, productId: string): Promise<TRequirement[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirements/`, {
      params: { product_id: productId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getRequirement(workspaceSlug: string, requirementId: string): Promise<TRequirement> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createProductRequirement(
    workspaceSlug: string,
    payload: TCreateProductRequirementPayload
  ): Promise<TRequirement> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirements/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateProductRequirement(
    workspaceSlug: string,
    requirementId: string,
    payload: TUpdateProductRequirementPayload
  ): Promise<TRequirement> {
    return this.patch(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteProductRequirement(workspaceSlug: string, requirementId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getConfiguration(workspaceSlug: string, requirementId: string): Promise<TRequirementConfiguration> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/configuration/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateConfiguration(
    workspaceSlug: string,
    requirementId: string,
    payload: TRequirementConfigurationPayload
  ): Promise<TRequirementConfiguration> {
    return this.put(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/configuration/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listDetails(
    workspaceSlug: string,
    requirementId: string,
    params: {
      cursor?: string;
      perPage?: number;
      search?: string;
      filters?: TRequirementDetailFilter[];
      /** 按模板切视图必须走服务端过滤 —— 明细是游标分页的 */
      requirementTypeId?: string;
    } = {}
  ): Promise<TRequirementDetailsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/details/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.filters?.length ? { filters: JSON.stringify(params.filters) } : {}),
        ...(params.requirementTypeId ? { requirement_type_id: params.requirementTypeId } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createDetail(
    workspaceSlug: string,
    requirementId: string,
    payload: {
      data: TRequirementDetailData;
      /** 新行绑定哪个需求模板 —— 字段与校验都以它为准 */
      requirement_type_id: string;
      before_id?: string;
      after_id?: string;
    }
  ): Promise<TRequirementDetail> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/details/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 从标准库导入条目，成为本需求绑定该库模板的明细行 */
  async importLibraryItems(
    workspaceSlug: string,
    requirementId: string,
    payload: TRequirementDetailImportPayload
  ): Promise<TRequirementDetailImportResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/details/import/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateDetail(
    workspaceSlug: string,
    requirementId: string,
    detailId: string,
    payload: { data: TRequirementDetailData; version: number }
  ): Promise<TRequirementDetail> {
    return this.patch(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/details/${detailId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteDetail(workspaceSlug: string, requirementId: string, detailId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/details/${detailId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkDeleteDetails(workspaceSlug: string, requirementId: string, detailIds: string[]): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/details/bulk-delete/`, {
      ids: detailIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkSaveDetails(
    workspaceSlug: string,
    requirementId: string,
    payload: TRequirementDetailBatchSavePayload
  ): Promise<TRequirementDetailBatchSaveResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/details/bulk-save/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 工作副本 --------------------------------------------------------- */

  /** 对应「编辑」按钮：已发布内容克隆出工作副本，状态置为草稿 */
  async startEditing(workspaceSlug: string, requirementId: string): Promise<TRequirementWorkingCopyResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/working-copy/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 对应「撤回草稿」：从未发布则删除需求，否则恢复到上一个已发布版本 */
  async discardDraft(workspaceSlug: string, requirementId: string): Promise<TRequirementDiscardDraftResponse> {
    return this.delete(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/working-copy/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 变更单 ----------------------------------------------------------- */

  async listChangeRequests(
    workspaceSlug: string,
    requirementId: string,
    params: { cursor?: string; perPage?: number; status?: TRequirementChangeStatus } = {}
  ): Promise<TRequirementChangeRequestsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/change-requests/`, {
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
    requirementId: string,
    changeRequestId: string
  ): Promise<TRequirementChangeRequestDetail> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/requirements/${requirementId}/change-requests/${changeRequestId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 明细数据组的变更项：千行量级下必须分页 */
  async listChangeItems(
    workspaceSlug: string,
    requirementId: string,
    changeRequestId: string,
    params: {
      cursor?: string;
      perPage?: number;
      changeType?: TRequirementChangeType;
      requirementTypeId?: string;
    } = {}
  ): Promise<TRequirementChangeItemsResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/requirements/${requirementId}/change-requests/${changeRequestId}/items/`,
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
    requirementId: string,
    payload: { reason: string }
  ): Promise<TRequirementChangeRequest> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/change-requests/submit/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async actOnChangeRequest(
    workspaceSlug: string,
    requirementId: string,
    changeRequestId: string,
    payload: { action: TRequirementApprovalAction; comment?: string }
  ): Promise<TRequirementChangeRequest> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/requirements/${requirementId}/change-requests/${changeRequestId}/act/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async cancelChangeRequest(
    workspaceSlug: string,
    requirementId: string,
    changeRequestId: string
  ): Promise<TRequirementChangeRequest> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/requirements/${requirementId}/change-requests/${changeRequestId}/cancel/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 版本 ------------------------------------------------------------- */

  async listVersions(
    workspaceSlug: string,
    requirementId: string,
    params: { cursor?: string; perPage?: number } = {}
  ): Promise<TRequirementVersionsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/versions/`, {
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

  async getVersion(workspaceSlug: string, requirementId: string, version: number): Promise<TRequirementVersionDetail> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/versions/${version}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 版本快照的 details 数组在服务端切片，避免整份返回 */
  async listVersionDetails(
    workspaceSlug: string,
    requirementId: string,
    version: number,
    params: { cursor?: string; perPage?: number; requirementTypeId?: string } = {}
  ): Promise<TRequirementVersionDetailsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/versions/${version}/details/`, {
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
    requirementId: string,
    version: number,
    params: {
      toVersion?: number;
      cursor?: string;
      perPage?: number;
      changeType?: TRequirementChangeType;
      requirementTypeId?: string;
    } = {}
  ): Promise<TRequirementVersionComparisonResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/requirements/${requirementId}/versions/${version}/compare/`,
      {
        params: {
          ...(params.toVersion ? { to_version: params.toVersion } : {}),
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

  /** 回滚只是把历史快照灌入工作副本，仍需提交审批才会生效 */
  async rollbackToVersion(
    workspaceSlug: string,
    requirementId: string,
    version: number
  ): Promise<TRequirementWorkingCopyResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/versions/${version}/rollback/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
