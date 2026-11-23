import { API_BASE_URL } from "@plane/constants";
import type {
  IUserLite,
  TCreateProductPayload,
  TDataDictionaryItemLite,
  TProduct,
  TProductOverview,
  TProductSetLite,
  TUpdateProductPayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";
import type { TProductWorkItemsQuery, TProductWorkItemsResponse } from "@/types/product-work-items";

type TProductSharedField =
  | "owner_detail"
  | "reviewer_details"
  | "project_lead_detail"
  | "test_lead_detail"
  | "stage_detail"
  | "category_detail"
  | "status_detail"
  | "hardware_level_detail"
  | "structure_level_detail"
  | "software_level_detail"
  | "product_set_detail"
  | "my_permission_keys";

/**
 * 列表接口的线上格式：全量返回，但人员 / 字典值 / 权限键集合只出现一次，
 * 行里只带 id 和下标（后端 build_product_list_payload）。
 */
type TProductListResponse = {
  products: (Omit<TProduct, TProductSharedField> & { permission_set: number })[];
  users: Record<string, IUserLite>;
  dictionary_items: Record<string, TDataDictionaryItemLite>;
  product_sets: Record<string, TProductSetLite>;
  permission_sets: string[][];
};

/** 把列表的线上格式还原成完整产品对象。同一个人 / 字典值 / 权限键数组在多个产品间共用，不要原地改。 */
const hydrateProductList = (response: TProductListResponse): TProduct[] => {
  const {
    users,
    dictionary_items: dictionaryItems,
    product_sets: productSets,
    permission_sets: permissionSets,
  } = response;
  const user = (id: string | null) => (id ? (users[id] ?? null) : null);
  const dictionaryItem = (id: string | null) => (id ? (dictionaryItems[id] ?? null) : null);
  return response.products.map(({ permission_set: permissionSet, ...row }) => ({
    ...row,
    owner_detail: users[row.owner],
    reviewer_details: row.reviewers.map((id) => users[id]),
    project_lead_detail: user(row.project_lead),
    test_lead_detail: user(row.test_lead),
    stage_detail: dictionaryItem(row.stage),
    category_detail: dictionaryItem(row.category),
    status_detail: dictionaryItem(row.status),
    hardware_level_detail: dictionaryItem(row.hardware_level),
    structure_level_detail: dictionaryItem(row.structure_level),
    software_level_detail: dictionaryItem(row.software_level),
    product_set_detail: row.product_set ? (productSets[row.product_set] ?? null) : null,
    my_permission_keys: permissionSets[permissionSet] ?? [],
  }));
};

/** PATCH 可透传的字段。新增产品字段时必须同步加进来，否则会被静默丢弃。 */
const PRODUCT_PATCH_FIELDS = [
  "name",
  "identifier",
  "description_html",
  "owner",
  "reviewers",
  "logo_props",
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
      .then((response) => hydrateProductList(response?.data))
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

  /** 概览页的汇总数字：需求 / 测试；关联项目与发布走各自页签的接口 */
  async getOverview(workspaceSlug: string, productId: string): Promise<TProductOverview> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/${productId}/overview/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 工作项页签：Issue.product 指向本产品的工作项（跨项目、只读、分页） */
  async getWorkItems(
    workspaceSlug: string,
    productId: string,
    params: TProductWorkItemsQuery
  ): Promise<TProductWorkItemsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/${productId}/work-items/`, { params })
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
