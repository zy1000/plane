import { API_BASE_URL } from "@plane/constants";
import type { IUserLite, TIssuePriorities } from "@plane/types";
import { APIService } from "@/services/api.service";

export type TRequirementType = "user" | "development";
export type TRequirementStatus = "in_review" | "active" | "rejected";
export type TRequirementChangeStatus = "pending" | "approved" | "rejected" | "superseded";
export type TRequirementReviewOpinion = "approved" | "rejected" | "needs_clarification";

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

export type TRequirementSnapshot = {
  name?: string;
  type?: TRequirementType;
  priority?: TIssuePriorities;
  module?: { id: string; name: string } | null;
  parent?: { id: string; name: string; type: TRequirementType } | null;
  assignee?: IUserLite | null;
  reviewers?: IUserLite[];
  description_html?: string | null;
  acceptance_criteria_html?: string | null;
  attachments?: TRequirementAttachment[];
};

export type TRequirementFieldDiff = {
  field: string;
  label: string;
  change_type: "added" | "modified";
  from: unknown;
  to: unknown;
  added?: unknown[];
  removed?: unknown[];
};

export type TRequirementDiff = {
  from_snapshot: TRequirementSnapshot;
  to_snapshot: TRequirementSnapshot;
  changed_fields: TRequirementFieldDiff[];
  changed_count: number;
};

export type TRequirementReviewRecord = {
  id: string;
  opinion: TRequirementReviewOpinion;
  reason: string;
  reviewer_detail: IUserLite;
  created_at: string;
};

export type TRequirementChangeReviewer = {
  id: string;
  reviewer: string;
  reviewer_detail: IUserLite;
  latest_opinion: TRequirementReviewOpinion | null;
  latest_reason: string;
  reviewed_at: string | null;
  records: TRequirementReviewRecord[];
};

export type TRequirementChange = {
  id: string;
  requirement: string;
  requirement_type: TRequirementType;
  requirement_status: TRequirementStatus;
  requirement_current_version: number;
  sequence: number;
  kind: "initial" | "change" | "system_reset";
  status: TRequirementChangeStatus;
  base_version: string | null;
  base_version_number: number | null;
  base_snapshot: TRequirementSnapshot;
  proposal_snapshot: TRequirementSnapshot;
  name: string;
  priority: TIssuePriorities;
  module: string | null;
  module_detail: Pick<TRequirementModule, "id" | "name"> | null;
  parent: string | null;
  parent_detail: { id: string; name: string; type: TRequirementType } | null;
  assignee: string | null;
  assignee_detail: IUserLite | null;
  proposed_reviewers: string[];
  proposed_reviewer_details: IUserLite[];
  description_html: string | null;
  acceptance_criteria_html: string | null;
  attachments: TRequirementAttachment[];
  reviewer_assignments: TRequirementChangeReviewer[];
  diff: TRequirementDiff;
  review_progress: {
    total: number;
    approved: number;
    rejected: number;
    needs_clarification: number;
    pending: number;
  };
  can_review: boolean;
  created_at: string;
  created_by: string | null;
  completed_at: string | null;
};

export type TUserRequirementListItem = {
  id: string;
  product: string;
  name: string;
  type: TRequirementType;
  priority: TIssuePriorities;
  status: TRequirementStatus;
  current_version: number;
  module: string | null;
  module_detail: Pick<TRequirementModule, "id" | "name"> | null;
  parent: string | null;
  parent_detail: { id: string; name: string; type: TRequirementType } | null;
  assignee: string | null;
  assignee_detail: IUserLite | null;
  reviewers: string[];
  reviewer_details: IUserLite[];
  attachment_count: number;
  sub_requirements_count: number;
  active_change: Pick<
    TRequirementChange,
    "id" | "sequence" | "kind" | "status" | "name" | "review_progress" | "can_review" | "created_at"
  > | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TUserRequirementDetail = TUserRequirementListItem & {
  description_html: string | null;
  acceptance_criteria_html: string | null;
  attachments: TRequirementAttachment[];
  latest_change: TRequirementChange | null;
};

export type TUserRequirementPayload = {
  name: string;
  priority: TIssuePriorities;
  module?: string | null;
  parent?: string | null;
  assignee?: string | null;
  reviewers: string[];
  description_html?: string | null;
  acceptance_criteria_html?: string | null;
  attachment_ids?: string[];
};

export type TUserRequirementListParams = {
  page?: number;
  page_size?: number;
  search?: string;
  priority?: string;
  status?: string;
  module?: string;
  assignee?: string;
};

export type TUserRequirementListResponse = {
  count: number;
  data: TUserRequirementListItem[];
};

export type TRequirementReviewListResponse = {
  count: number;
  pending_count: number;
  data: TRequirementChange[];
};

export type TRequirementVersion = {
  id: string;
  version: number;
  source: string;
  change_id: string | null;
  created_at: string;
  created_by: string | null;
  snapshot?: TRequirementSnapshot;
  review?: TRequirementChange | null;
};

export class RequirementService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private requirementUrl(workspaceSlug: string, productId: string, type: TRequirementType = "user") {
    const prefix = type === "user" ? "user-requirements" : "development-requirements";
    return `/api/workspaces/${workspaceSlug}/products/${productId}/${prefix}/`;
  }

  private moduleUrl(workspaceSlug: string, productId: string) {
    return `/api/workspaces/${workspaceSlug}/products/${productId}/requirement-modules/`;
  }

  async getUserRequirements(
    workspaceSlug: string,
    productId: string,
    params: TUserRequirementListParams,
    type: TRequirementType = "user"
  ): Promise<TUserRequirementListResponse> {
    return this.get(this.requirementUrl(workspaceSlug, productId, type), { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getUserRequirement(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    type: TRequirementType = "user"
  ) {
    return this.get(`${this.requirementUrl(workspaceSlug, productId, type)}${requirementId}/`)
      .then((response) => response?.data as TUserRequirementDetail)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getParentOptions(
    workspaceSlug: string,
    productId: string,
    search?: string,
    exclude?: string,
    type: TRequirementType = "user"
  ) {
    return this.get(`${this.requirementUrl(workspaceSlug, productId, type)}options/`, {
      params: { search, exclude },
    })
      .then((response) => response?.data as { id: string; name: string; type: TRequirementType }[])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createUserRequirement(
    workspaceSlug: string,
    productId: string,
    data: TUserRequirementPayload,
    type: TRequirementType = "user"
  ) {
    return this.post(this.requirementUrl(workspaceSlug, productId, type), data)
      .then((response) => response?.data as TUserRequirementDetail)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateUserRequirement(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    data: Partial<TUserRequirementPayload>,
    type: TRequirementType = "user"
  ) {
    return this.post(`${this.requirementUrl(workspaceSlug, productId, type)}${requirementId}/changes/`, data)
      .then((response) => response?.data as TRequirementChange)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteUserRequirement(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    type: TRequirementType = "user"
  ) {
    return this.delete(`${this.requirementUrl(workspaceSlug, productId, type)}${requirementId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getChange(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    changeId: string,
    type: TRequirementType
  ): Promise<TRequirementChange> {
    return this.get(`${this.requirementUrl(workspaceSlug, productId, type)}${requirementId}/changes/${changeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getChanges(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    type: TRequirementType
  ): Promise<{ count: number; data: TRequirementChange[] }> {
    return this.get(`${this.requirementUrl(workspaceSlug, productId, type)}${requirementId}/changes/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reviewChange(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    changeId: string,
    type: TRequirementType,
    data: { opinion: TRequirementReviewOpinion; reason?: string }
  ): Promise<TRequirementChange> {
    return this.post(
      `${this.requirementUrl(workspaceSlug, productId, type)}${requirementId}/changes/${changeId}/reviews/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getMyReviews(
    workspaceSlug: string,
    productId: string,
    type: TRequirementType,
    tab: "pending" | "processed"
  ): Promise<TRequirementReviewListResponse> {
    return this.get(`${this.requirementUrl(workspaceSlug, productId, type)}my-reviews/`, { params: { tab } })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getVersions(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    type: TRequirementType
  ): Promise<TRequirementVersion[]> {
    return this.get(`${this.requirementUrl(workspaceSlug, productId, type)}${requirementId}/versions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getVersion(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    version: number,
    type: TRequirementType
  ): Promise<TRequirementVersion> {
    return this.get(`${this.requirementUrl(workspaceSlug, productId, type)}${requirementId}/versions/${version}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async compare(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    type: TRequirementType,
    params: { from_version?: number; to_version?: number; to_change_id?: string }
  ): Promise<TRequirementDiff> {
    return this.get(`${this.requirementUrl(workspaceSlug, productId, type)}${requirementId}/compare/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getModules(
    workspaceSlug: string,
    productId: string,
    type: TRequirementType = "user"
  ): Promise<TRequirementModuleListResponse> {
    return this.get(this.moduleUrl(workspaceSlug, productId), { params: { requirement_type: type } })
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
