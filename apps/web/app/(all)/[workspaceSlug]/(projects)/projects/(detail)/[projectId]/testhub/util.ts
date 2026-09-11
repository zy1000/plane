import { RepositoryService } from "@/services/qa";

export const formatDateTime = (isoString:string) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };
export const formatDate = (isoString:string) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  };


// layout 与页面会在同一次挂载里各调一次,这里合并同一工作区正在飞行中的请求;
// 请求结束即清掉,枚举来自可编辑的数据字典,不做跨请求缓存
const enumsInFlight = new Map<string, Promise<any>>();

export const getEnums = async (workspaceSlug: string) => {
  const existing = enumsInFlight.get(workspaceSlug);
  if (existing) return existing;
  const repositoryService = new RepositoryService();
  const request = repositoryService
    .enumsList(workspaceSlug as string)
    .then((response: any) => response || {})
    .finally(() => enumsInFlight.delete(workspaceSlug));
  enumsInFlight.set(workspaceSlug, request);
  return request;
}

export type TGlobalEnums = {
  plan_state: Record<number | string, string>;
  case_state: Record<number | string, string>;
  case_type: Record<number | string, string>;
  case_priority: Record<number | string, string>;
  plan_case_result: Record<number | string, string>;
};

export const globalEnums = {
  Enums: { 
    plan_state: {}, 
    case_state: {}, 
    case_type: {}, 
    case_priority: {},
    plan_case_result: {}
  } as TGlobalEnums,
  setEnums: (value: TGlobalEnums) => {
    globalEnums.Enums = value;
  },
};

