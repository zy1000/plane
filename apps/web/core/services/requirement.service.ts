import { API_BASE_URL } from "@plane/constants";
import type { IUserLite, TIssuePriorities } from "@plane/types";
import { APIService } from "@/services/api.service";

export type TRequirementModule = {
  id: string;
  product: string;
  name: string;
  requirement_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TRequirementModuleListResponse = {
  total: number;
  modules: TRequirementModule[];
};

export type TRequirementAttachment = {
  id: string;
  attributes: { name?: string; type?: string; size?: number };
  asset_url: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type TUserRequirementListItem = {
  id: string;
  product: string;
  name: string;
  type: "user";
  priority: TIssuePriorities;
  module: string | null;
  module_detail: Pick<TRequirementModule, "id" | "name"> | null;
  parent: string | null;
  parent_detail: { id: string; name: string } | null;
  assignee: string | null;
  assignee_detail: IUserLite | null;
  reviewers: string[];
  reviewer_details: IUserLite[];
  attachment_count: number;
  sub_requirements_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TUserRequirementDetail = TUserRequirementListItem & {
  description_html: string | null;
  acceptance_criteria_html: string | null;
  attachments: TRequirementAttachment[];
};

export type TUserRequirementPayload = {
  name: string;
  priority: TIssuePriorities;
  module?: string | null;
  parent?: string | null;
  assignee?: string | null;
  reviewers?: string[];
  description_html?: string | null;
  acceptance_criteria_html?: string | null;
  attachment_ids?: string[];
};

export type TUserRequirementListParams = {
  page?: number;
  page_size?: number;
  search?: string;
  priority?: string;
  module?: string;
  assignee?: string;
};

export type TUserRequirementListResponse = {
  count: number;
  data: TUserRequirementListItem[];
};

export class RequirementService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private requirementUrl(workspaceSlug: string, productId: string) {
    return `/api/workspaces/${workspaceSlug}/products/${productId}/user-requirements/`;
  }

  private moduleUrl(workspaceSlug: string, productId: string) {
    return `/api/workspaces/${workspaceSlug}/products/${productId}/requirement-modules/`;
  }

  async getUserRequirements(
    workspaceSlug: string,
    productId: string,
    params: TUserRequirementListParams
  ): Promise<TUserRequirementListResponse> {
    return this.get(this.requirementUrl(workspaceSlug, productId), { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getUserRequirement(workspaceSlug: string, productId: string, requirementId: string) {
    return this.get(`${this.requirementUrl(workspaceSlug, productId)}${requirementId}/`)
      .then((response) => response?.data as TUserRequirementDetail)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getParentOptions(workspaceSlug: string, productId: string, search?: string, exclude?: string) {
    return this.get(`${this.requirementUrl(workspaceSlug, productId)}options/`, {
      params: { search, exclude },
    })
      .then((response) => response?.data as { id: string; name: string }[])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createUserRequirement(workspaceSlug: string, productId: string, data: TUserRequirementPayload) {
    return this.post(this.requirementUrl(workspaceSlug, productId), data)
      .then((response) => response?.data as TUserRequirementDetail)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateUserRequirement(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    data: Partial<TUserRequirementPayload>
  ) {
    return this.patch(`${this.requirementUrl(workspaceSlug, productId)}${requirementId}/`, data)
      .then((response) => response?.data as TUserRequirementDetail)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteUserRequirement(workspaceSlug: string, productId: string, requirementId: string) {
    return this.delete(`${this.requirementUrl(workspaceSlug, productId)}${requirementId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getModules(workspaceSlug: string, productId: string): Promise<TRequirementModuleListResponse> {
    return this.get(this.moduleUrl(workspaceSlug, productId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createModule(workspaceSlug: string, productId: string, name: string): Promise<TRequirementModule> {
    return this.post(this.moduleUrl(workspaceSlug, productId), { name })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateModule(
    workspaceSlug: string,
    productId: string,
    moduleId: string,
    name: string
  ): Promise<TRequirementModule> {
    return this.patch(`${this.moduleUrl(workspaceSlug, productId)}${moduleId}/`, { name })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteModule(workspaceSlug: string, productId: string, moduleId: string) {
    return this.delete(`${this.moduleUrl(workspaceSlug, productId)}${moduleId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
