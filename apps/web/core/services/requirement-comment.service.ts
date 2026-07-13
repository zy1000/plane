import { API_BASE_URL } from "@plane/constants";
import type { IUserLite } from "@plane/types";
import type { TRequirementType } from "@/services/requirement.service";
import { APIService } from "@/services/api.service";

export type TRequirementComment = {
  id: string;
  requirement: string;
  actor: string;
  actor_detail: IUserLite;
  comment_stripped: string;
  comment_json: Record<string, unknown> | null;
  comment_html: string;
  parent: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TRequirementCommentPayload = {
  comment_html: string;
  comment_json?: unknown;
  parent?: string | null;
  asset_ids?: string[];
};

export class RequirementCommentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private commentsUrl(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    requirementType: TRequirementType
  ) {
    const prefix = requirementType === "user" ? "user-requirements" : "development-requirements";
    return `/api/workspaces/${workspaceSlug}/products/${productId}/${prefix}/${requirementId}/comments/`;
  }

  async getComments(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    requirementType: TRequirementType
  ): Promise<TRequirementComment[]> {
    return this.get(this.commentsUrl(workspaceSlug, productId, requirementId, requirementType))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createComment(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    requirementType: TRequirementType,
    data: TRequirementCommentPayload
  ): Promise<TRequirementComment> {
    return this.post(this.commentsUrl(workspaceSlug, productId, requirementId, requirementType), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteComment(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    requirementType: TRequirementType,
    commentId: string
  ): Promise<void> {
    return this.delete(`${this.commentsUrl(workspaceSlug, productId, requirementId, requirementType)}${commentId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
