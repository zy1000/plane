import { API_BASE_URL } from "@plane/constants";
import type { TRequirementFieldDefinition, TRequirementFieldDefinitionPayload } from "@plane/types";
import { APIService } from "@/services/api.service";

/**
 * 工作区「需求通用字段库」。读 = 工作区成员，写 = 需求类型管理权限。
 * 改定义后后端在同一事务里同步到所有绑定它的需求类型。
 */
export class RequirementFieldLibraryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private root(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/requirement-field-definitions`;
  }

  async list(workspaceSlug: string): Promise<TRequirementFieldDefinition[]> {
    return this.get(`${this.root(workspaceSlug)}/`)
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 名称工作区内唯一（不分大小写），重名 400 `{error}` */
  async create(
    workspaceSlug: string,
    payload: TRequirementFieldDefinitionPayload
  ): Promise<TRequirementFieldDefinition> {
    return this.post(`${this.root(workspaceSlug)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 会清掉已有字段值时 409 `REQUIREMENT_FIELD_LIBRARY_DATA_LOSS`（带各需求类型受影响的条数），
   * 确认后带 `confirm_data_loss` 重发。
   */
  async update(
    workspaceSlug: string,
    fieldId: string,
    payload: TRequirementFieldDefinitionPayload
  ): Promise<TRequirementFieldDefinition> {
    return this.patch(`${this.root(workspaceSlug)}/${fieldId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 仍被需求类型使用时 409 `REQUIREMENT_FIELD_DEFINITION_IN_USE` */
  async remove(workspaceSlug: string, fieldId: string): Promise<void> {
    return this.delete(`${this.root(workspaceSlug)}/${fieldId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 把需求类型里的一个私有字段原地转为通用字段：字段 id 与已有值不变 */
  async promote(
    workspaceSlug: string,
    requirementTypeId: string,
    fieldId: string
  ): Promise<TRequirementFieldDefinition> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/requirement-types/${requirementTypeId}/fields/${fieldId}/promote/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
