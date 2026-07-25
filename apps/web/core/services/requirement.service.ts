import { API_BASE_URL } from "@plane/constants";
import type {
  TCreateProductRequirementPayload,
  TCreateRequirementTemplatePayload,
  TRequirement,
  TRequirementConfiguration,
  TRequirementConfigurationPayload,
  TRequirementDetail,
  TRequirementDetailBatchSavePayload,
  TRequirementDetailBatchSaveResponse,
  TRequirementDetailData,
  TRequirementDetailFilter,
  TRequirementDetailsResponse,
  TUpdateProductRequirementPayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class RequirementService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listTemplates(workspaceSlug: string): Promise<TRequirement[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirements/`, {
      params: { is_template: true },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createTemplate(workspaceSlug: string, payload: TCreateRequirementTemplatePayload): Promise<TRequirement> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirements/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteTemplate(workspaceSlug: string, templateId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/requirements/${templateId}/`)
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
    } = {}
  ): Promise<TRequirementDetailsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirements/${requirementId}/details/`, {
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

  async createDetail(
    workspaceSlug: string,
    requirementId: string,
    payload: {
      data: TRequirementDetailData;
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
}
