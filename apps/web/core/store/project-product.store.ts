/**
 * 项目关联产品池 + 各产品的模块树，供工作项的「产品 / 产品模块」属性共用：
 * 下拉候选、列表分组列、筛选项、表格列回显都从这一份读。
 *
 * 现有 useProjectProducts 是 SWR 局部 state，issue-layouts 的分组列在非 hook
 * 环境（store 单例）里拿不到，所以这里另起 MobX store；数据源是同一个接口。
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { TFlatProductModule, TProductOption, TRequirementModule } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";
import type { CoreRootStore } from "./root.store";

export const flattenProductModules = (
  nodes: TRequirementModule[],
  productId: string,
  depth = 0,
  prefix = ""
): TFlatProductModule[] =>
  nodes.flatMap((node) => {
    const path = prefix ? `${prefix} / ${node.name}` : node.name;
    return [
      { id: node.id, name: node.name, path, depth, product_id: productId },
      ...flattenProductModules(node.children ?? [], productId, depth + 1, path),
    ];
  });

export interface IProjectProductStore {
  productMap: Record<string, TProductOption>;
  productIdsByProject: Record<string, string[]>;
  moduleMap: Record<string, TFlatProductModule>;
  moduleIdsByProduct: Record<string, string[]>;
  // computed actions
  getProductById: (productId: string) => TProductOption | null;
  getProjectProductIds: (projectId: string) => string[] | null;
  getProductModuleById: (moduleId: string) => TFlatProductModule | null;
  getProductModuleIds: (productId: string) => string[] | null;
  getProjectProductModuleIds: (projectId: string) => string[];
  // actions
  fetchProducts: (workspaceSlug: string, projectId: string) => Promise<TProductOption[]>;
  fetchProductModules: (workspaceSlug: string, projectId: string, productId: string) => Promise<TFlatProductModule[]>;
  fetchProjectProductModules: (workspaceSlug: string, projectId: string) => Promise<void>;
}

export class ProjectProductStore implements IProjectProductStore {
  productMap: Record<string, TProductOption> = {};
  productIdsByProject: Record<string, string[]> = {};
  moduleMap: Record<string, TFlatProductModule> = {};
  moduleIdsByProduct: Record<string, string[]> = {};
  // 进行中的请求去重：分组列 / 下拉 / 筛选可能同时触发
  private pendingProducts: Record<string, Promise<TProductOption[]>> = {};
  private pendingModules: Record<string, Promise<TFlatProductModule[]>> = {};

  requirementService: RequirementService;
  rootStore: CoreRootStore;

  constructor(rootStore: CoreRootStore) {
    makeObservable(this, {
      productMap: observable,
      productIdsByProject: observable,
      moduleMap: observable,
      moduleIdsByProduct: observable,
      fetchProducts: action,
      fetchProductModules: action,
      fetchProjectProductModules: action,
    });
    this.rootStore = rootStore;
    this.requirementService = new RequirementService();
  }

  getProductById = computedFn((productId: string) => this.productMap[productId] ?? null);

  getProjectProductIds = computedFn((projectId: string) => this.productIdsByProject[projectId] ?? null);

  getProductModuleById = computedFn((moduleId: string) => this.moduleMap[moduleId] ?? null);

  getProductModuleIds = computedFn((productId: string) => this.moduleIdsByProduct[productId] ?? null);

  /** 项目下所有已拉取产品的模块 id，按产品顺序拼接（分组列 / 筛选项用） */
  getProjectProductModuleIds = computedFn((projectId: string) =>
    (this.productIdsByProject[projectId] ?? []).flatMap((productId) => this.moduleIdsByProduct[productId] ?? [])
  );

  fetchProducts = async (workspaceSlug: string, projectId: string) => {
    const key = `${workspaceSlug}/${projectId}`;
    if (this.pendingProducts[key]) return this.pendingProducts[key];
    const request = this.requirementService
      .listProjectProducts(workspaceSlug, projectId)
      .then((links) => {
        const options: TProductOption[] = links.map((link) => ({
          id: link.product,
          name: link.product_name,
          identifier: link.product_identifier,
          code: link.product_code,
          logo_props: link.product_logo_props,
        }));
        runInAction(() => {
          options.forEach((option) => {
            this.productMap[option.id] = option;
          });
          this.productIdsByProject[projectId] = options.map((option) => option.id);
        });
        return options;
      })
      .finally(() => {
        delete this.pendingProducts[key];
      });
    this.pendingProducts[key] = request;
    return request;
  };

  fetchProductModules = async (workspaceSlug: string, projectId: string, productId: string) => {
    const key = `${workspaceSlug}/${projectId}/${productId}`;
    if (this.pendingModules[key]) return this.pendingModules[key];
    const request = this.requirementService
      .listProjectProductRequirementModules(workspaceSlug, projectId, productId)
      .then((response) => {
        const modules = flattenProductModules(response.modules ?? [], productId);
        runInAction(() => {
          modules.forEach((module) => {
            this.moduleMap[module.id] = module;
          });
          this.moduleIdsByProduct[productId] = modules.map((module) => module.id);
        });
        return modules;
      })
      .finally(() => {
        delete this.pendingModules[key];
      });
    this.pendingModules[key] = request;
    return request;
  };

  /** 拉产品池 + 每个产品的模块树（分组 / 筛选需要整个项目的模块候选） */
  fetchProjectProductModules = async (workspaceSlug: string, projectId: string) => {
    const products = this.productIdsByProject[projectId]
      ? (this.productIdsByProject[projectId] ?? []).map((id) => this.productMap[id])
      : await this.fetchProducts(workspaceSlug, projectId);
    await Promise.all(
      products
        .filter((product) => !this.moduleIdsByProduct[product.id])
        .map((product) => this.fetchProductModules(workspaceSlug, projectId, product.id).catch(() => []))
    );
  };
}
