import { API_BASE_URL } from "@plane/constants";
import type {
  TCreateRequirementTypePayload,
  TRequirementType,
  TRequirementTypeConfiguration,
  TRequirementTypeConfigurationPayload,
  TUpdateRequirementTypePayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

/**
 * 需求类型只定义字段结构，没有明细、版本与变更单，因此不复用 RequirementService。
 */
export class RequirementTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listRequirementTypes(workspaceSlug: string): Promise<TRequirementType[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-types/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getRequirementType(workspaceSlug: string, requirementTypeId: string): Promise<TRequirementType> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-types/${requirementTypeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRequirementType(
    workspaceSlug: string,
    payload: TCreateRequirementTypePayload
  ): Promise<TRequirementType> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirement-types/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRequirementType(
    workspaceSlug: string,
    requirementTypeId: string,
    payload: TUpdateRequirementTypePayload
  ): Promise<TRequirementType> {
    return this.patch(`/api/workspaces/${workspaceSlug}/requirement-types/${requirementTypeId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRequirementType(workspaceSlug: string, requirementTypeId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/requirement-types/${requirementTypeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getConfiguration(workspaceSlug: string, requirementTypeId: string): Promise<TRequirementTypeConfiguration> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-types/${requirementTypeId}/configuration/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateConfiguration(
    workspaceSlug: string,
    requirementTypeId: string,
    payload: TRequirementTypeConfigurationPayload
  ): Promise<TRequirementTypeConfiguration> {
    return this.put(`/api/workspaces/${workspaceSlug}/requirement-types/${requirementTypeId}/configuration/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
