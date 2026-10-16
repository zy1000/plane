import { API_BASE_URL } from "@plane/constants";
import type { TDepartmentPeopleQuery, TDepartmentPeopleResponse, TDepartmentTree } from "@plane/types";
import { APIService } from "@/services/api.service";

/** 工作区设置 → 部门（只读）：部门树 + 人员分页。同步走 ExternalIntegrationService.sync(…, "mdm_person_info")。 */
export class DepartmentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchTree(workspaceSlug: string): Promise<TDepartmentTree> {
    return this.get(`/api/workspaces/${workspaceSlug}/departments/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchPeople(workspaceSlug: string, query: TDepartmentPeopleQuery): Promise<TDepartmentPeopleResponse> {
    const params: Record<string, string | number> = {
      include_children: query.include_children ? "1" : "0",
      page: query.page,
      per_page: query.per_page,
    };
    if (query.department) params.department = query.department;
    if (query.search.trim()) params.search = query.search.trim();
    if (query.leader) params.leader = query.leader;
    if (query.login) params.login = query.login;
    return this.get(`/api/workspaces/${workspaceSlug}/departments/people/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
