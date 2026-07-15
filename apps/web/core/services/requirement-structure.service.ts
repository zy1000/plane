import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TRequirementContentMode = "text" | "structured";
export type TStructuredFieldType =
  | "text"
  | "number"
  | "number_range"
  | "boolean"
  | "date"
  | "select"
  | "auto_id"
  | "table";

export type TStructuredField = {
  key: string;
  parent_key: string | null;
  name: string;
  description: string;
  field_type: TStructuredFieldType;
  sort_key?: string;
  is_required: boolean;
  is_active: boolean;
  config: Record<string, unknown>;
  validation: Record<string, unknown>;
  options: { options?: { key: string; label: string; is_active?: boolean }[] };
  default_value: unknown;
};

export type TRequirementTemplateType = "structured";

export type TRequirementTemplateSummary = {
  id: string;
  product: string;
  name: string;
  description: string;
  template_type: TRequirementTemplateType;
  revision: number;
  is_active: boolean;
  field_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TRequirementTemplate = TRequirementTemplateSummary & {
  fields: TStructuredField[];
};

export type TRequirementTemplatePayload = {
  name: string;
  description: string;
  template_type: TRequirementTemplateType;
  is_active: boolean;
  fields: TStructuredField[];
};

export type TStructuredRevision = {
  id: string;
  requirement: string;
  change: string;
  source_revision: string | null;
  source_template: string | null;
  source_template_revision: number | null;
  status: "draft" | "locked";
  lock_version: number;
  schema_hash: string;
  content_hash: string;
  root_row_count: number;
  child_row_count: number;
  locked_at: string | null;
  fields: TStructuredField[];
};

export type TStructuredValue = string | boolean | string[] | { min: string; max: string } | null;

export type TStructuredRow = {
  key: string;
  parent_row_key: string | null;
  table_field_key: string | null;
  display_id: string | null;
  sequence_number: number | null;
  sort_key: string;
  values: Record<string, TStructuredValue>;
};

export type TStructuredRowsResponse = {
  revision_id: string;
  lock_version: number;
  next_cursor: string | null;
  data: TStructuredRow[];
};

export type TStructuredDiffEntry = {
  id: string;
  scope: "schema" | "root_row" | "child_row";
  change_type: "added" | "removed" | "modified" | "moved";
  field_key: string | null;
  row_key: string | null;
  parent_row_key: string | null;
  label: string;
  before_value: unknown;
  after_value: unknown;
};

export class RequirementStructureService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private templateUrl(workspaceSlug: string, productId: string) {
    return `/api/workspaces/${workspaceSlug}/products/${productId}/requirement-templates/`;
  }

  private revisionUrl(workspaceSlug: string, productId: string, requirementId: string, revisionId: string) {
    return `/api/workspaces/${workspaceSlug}/products/${productId}/development-requirements/${requirementId}/structured-revisions/${revisionId}/`;
  }

  async getRequirementTemplates(
    workspaceSlug: string,
    productId: string,
    active = false
  ): Promise<TRequirementTemplateSummary[]> {
    return this.get(this.templateUrl(workspaceSlug, productId), {
      params: { ...(active ? { active: true } : {}), template_type: "structured" },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRequirementTemplate(workspaceSlug: string, productId: string, data: TRequirementTemplatePayload) {
    return this.post(this.templateUrl(workspaceSlug, productId), data)
      .then((response) => response?.data as TRequirementTemplate)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getRequirementTemplate(workspaceSlug: string, productId: string, templateId: string) {
    return this.get(`${this.templateUrl(workspaceSlug, productId)}${templateId}/`)
      .then((response) => response?.data as TRequirementTemplate)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRequirementTemplate(
    workspaceSlug: string,
    productId: string,
    templateId: string,
    revision: number,
    data: TRequirementTemplatePayload
  ) {
    return this.put(`${this.templateUrl(workspaceSlug, productId)}${templateId}/`, { ...data, revision })
      .then((response) => response?.data as TRequirementTemplate)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRequirementTemplateStatus(
    workspaceSlug: string,
    productId: string,
    templateId: string,
    revision: number,
    isActive: boolean
  ) {
    return this.patch(`${this.templateUrl(workspaceSlug, productId)}${templateId}/`, {
      revision,
      is_active: isActive,
    })
      .then((response) => response?.data as TRequirementTemplateSummary)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRequirementTemplate(workspaceSlug: string, productId: string, templateId: string) {
    return this.delete(`${this.templateUrl(workspaceSlug, productId)}${templateId}/`).catch((error) => {
      throw error?.response?.data;
    });
  }

  async getRevision(workspaceSlug: string, productId: string, requirementId: string, revisionId: string) {
    return this.get(this.revisionUrl(workspaceSlug, productId, requirementId, revisionId))
      .then((response) => response?.data as TStructuredRevision)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRevisionSchema(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    revisionId: string,
    lockVersion: number,
    fields: TStructuredField[]
  ) {
    return this.put(`${this.revisionUrl(workspaceSlug, productId, requirementId, revisionId)}schema/`, {
      lock_version: lockVersion,
      fields,
    })
      .then((response) => response?.data as TStructuredRevision)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getRows(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    revisionId: string,
    params?: { cursor?: string; page_size?: number; parent_row_key?: string; table_field_key?: string }
  ) {
    return this.get(`${this.revisionUrl(workspaceSlug, productId, requirementId, revisionId)}rows/`, { params })
      .then((response) => response?.data as TStructuredRowsResponse)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRow(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    revisionId: string,
    data: {
      lock_version: number;
      values?: Record<string, TStructuredValue>;
      parent_row_key?: string;
      table_field_key?: string;
      before_row_key?: string;
      after_row_key?: string;
    }
  ) {
    return this.post(`${this.revisionUrl(workspaceSlug, productId, requirementId, revisionId)}rows/`, data)
      .then((response) => response?.data as { lock_version: number; row: TStructuredRow })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRow(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    revisionId: string,
    rowKey: string,
    lockVersion: number,
    values: Record<string, TStructuredValue>
  ) {
    return this.patch(`${this.revisionUrl(workspaceSlug, productId, requirementId, revisionId)}rows/${rowKey}/`, {
      lock_version: lockVersion,
      values,
    })
      .then((response) => response?.data as { lock_version: number; row: TStructuredRow })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRow(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    revisionId: string,
    rowKey: string,
    lockVersion: number
  ) {
    return this.delete(`${this.revisionUrl(workspaceSlug, productId, requirementId, revisionId)}rows/${rowKey}/`, {
      lock_version: lockVersion,
    })
      .then((response) => response?.data as { lock_version: number })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reorderRow(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    revisionId: string,
    rowKey: string,
    data: { lock_version: number; before_row_key?: string; after_row_key?: string }
  ) {
    return this.post(
      `${this.revisionUrl(workspaceSlug, productId, requirementId, revisionId)}rows/${rowKey}/reorder/`,
      data
    )
      .then((response) => response?.data as { lock_version: number; row: TStructuredRow })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getDiff(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    changeId: string,
    params?: { scope?: string; offset?: number; page_size?: number }
  ) {
    return this.get(
      `/api/workspaces/${workspaceSlug}/products/${productId}/development-requirements/${requirementId}/changes/${changeId}/structured-diff/`,
      { params }
    )
      .then((response) => response?.data as { count: number; next_offset: number | null; data: TStructuredDiffEntry[] })
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
