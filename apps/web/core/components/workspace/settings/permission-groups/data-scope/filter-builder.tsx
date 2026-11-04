/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { isEqual } from "lodash-es";
import { observer } from "mobx-react";
import { FilterInstance } from "@plane/shared-state";
import type { IFilterInstance } from "@plane/shared-state";
import type { TExternalFilter, TProduct, TProject } from "@plane/types";
import { productFiltersAdapter } from "@/components/products/filters/adapter";
import type { TProductFilterExpression, TProductFilterProperty } from "@/components/products/filters/types";
import { useProductFiltersConfig } from "@/components/products/filters/use-product-filters-config";
import { projectFiltersAdapter } from "@/components/project/filters/adapter";
import type { TProjectFilterExpression, TProjectFilterProperty } from "@/components/project/filters/types";
import { useProjectFiltersConfig } from "@/components/project/filters/use-project-filters-config";
import { useProjectListLookups } from "@/components/project/filters/use-project-list-lookups";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { ProductService } from "@/services/product.service";

const productService = new ProductService();

type TFilterValue = Record<string, unknown>;

type Props = {
  workspaceSlug: string;
  /** 白名单 entry.filter：项目列表 / 产品列表筛选 adapter 的扁平格式 */
  value: TFilterValue | undefined;
  onChange: (filter: TFilterValue) => void;
  readOnly?: boolean;
};

/**
 * 每个「按条件」段一个独立的筛选实例：初始值来自草稿，改动写回草稿；放弃 / 重新加载时把外部值灌回实例。
 * 不用项目列表那个挂在 store 上的实例——那是列表页自己的筛选，这里是在配权限。
 */
const useScopeFilterInstance = <P extends TProjectFilterProperty | TProductFilterProperty, E extends TExternalFilter>(
  adapter: FilterInstance<P, E>["adapter"],
  value: TFilterValue | undefined,
  onChange: (filter: TFilterValue) => void
): IFilterInstance<P, E> => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmitted = useRef<TFilterValue | undefined>(value);
  const filter = useMemo(
    () =>
      new FilterInstance<P, E>({
        adapter,
        initialExpression: (value ?? {}) as unknown as E,
        onExpressionChange: (expression) => {
          lastEmitted.current = expression as unknown as TFilterValue;
          onChangeRef.current(expression as unknown as TFilterValue);
        },
      }),
    // 只建一次；外部值变化走下面的 resetExpression
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adapter]
  );

  useEffect(() => {
    // 外部把值改回去了（放弃 / 重新加载）：灌回实例；自己刚发出去的不用灌
    if (isEqual(value ?? {}, lastEmitted.current ?? {})) return;
    lastEmitted.current = value;
    filter.resetExpression((value ?? {}) as unknown as E);
  }, [filter, value]);

  useEffect(() => {
    filter.toggleVisibility(true);
  }, [filter]);

  return filter;
};

export const ProjectScopeFilterBuilder = observer(function ProjectScopeFilterBuilder(props: Props) {
  const { workspaceSlug, value, onChange, readOnly } = props;
  const { totalProjectIds, getProjectById } = useProject();
  const lookups = useProjectListLookups(workspaceSlug);
  const { data: currentUser } = useUser();
  const {
    workspace: { workspaceMemberIds },
    getUserDetails,
  } = useMember();
  const projects = useMemo<TProject[]>(
    () =>
      (totalProjectIds ?? [])
        .map((id) => getProjectById(id))
        .filter((project): project is TProject => Boolean(project)),
    [totalProjectIds, getProjectById]
  );
  const memberIds = useMemo(() => workspaceMemberIds ?? [], [workspaceMemberIds]);
  const configs = useProjectFiltersConfig({
    workspaceSlug,
    projects,
    lookups,
    currentUser: currentUser ?? undefined,
    workspaceMemberIds: memberIds,
    getUserDetails,
  });
  const filter = useScopeFilterInstance<TProjectFilterProperty, TProjectFilterExpression>(
    projectFiltersAdapter,
    value,
    onChange
  );

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(true);
  }, [filter, configs]);

  return <FiltersRow filter={filter} variant="modal" disabledAllOperations={readOnly} />;
});

export const ProductScopeFilterBuilder = observer(function ProductScopeFilterBuilder(props: Props) {
  const { workspaceSlug, value, onChange, readOnly } = props;
  const { data: currentUser } = useUser();
  const [products, setProducts] = useState<TProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    productService
      .list(workspaceSlug)
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  const configs = useProductFiltersConfig({ workspaceSlug, products, currentUser: currentUser ?? undefined });
  const filter = useScopeFilterInstance<TProductFilterProperty, TProductFilterExpression>(
    productFiltersAdapter,
    value,
    onChange
  );

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(true);
  }, [filter, configs]);

  return <FiltersRow filter={filter} variant="modal" disabledAllOperations={readOnly} />;
});
