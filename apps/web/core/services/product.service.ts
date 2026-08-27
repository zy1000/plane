import { API_BASE_URL } from "@plane/constants";
import type { TCreateProductPayload, TProduct, TUpdateProductPayload } from "@plane/types";
import { APIService } from "@/services/api.service";

/** PATCH 可透传的字段。新增产品字段时必须同步加进来，否则会被静默丢弃。 */
const PRODUCT_PATCH_FIELDS = [
  "name",
  "identifier",
  "description_html",
  "network",
  "owner",
  "reviewers",
  "logo_props",
  "cover_image",
  "code",
  "stage",
  "category",
  "status",
  "hardware_level",
  "structure_level",
  "software_level",
  "start_date",
  "project_lead",
  "test_lead",
  "model_number",
  "external_model",
  "o_phase_close_date",
  "v_phase_close_date",
] as const satisfies readonly (keyof TUpdateProductPayload)[];

export class ProductService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TProduct[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, productId: string): Promise<TProduct> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/${productId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: TCreateProductPayload): Promise<TProduct> {
    return this.post(`/api/workspaces/${workspaceSlug}/products/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, productId: string, payload: TUpdateProductPayload): Promise<TProduct> {
    // 白名单透传：只发 undefined 以外的字段（null 表示清空，要透传）。
    // 不透传 cover_image_asset：编辑换封面统一走资产上传确认由后端回写绑定。
    const body = Object.fromEntries(
      PRODUCT_PATCH_FIELDS.filter((key) => payload[key] !== undefined).map((key) => [key, payload[key]])
    );
    return this.patch(`/api/workspaces/${workspaceSlug}/products/${productId}/`, body)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteProduct(workspaceSlug: string, productId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/products/${productId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
