/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { ProductService } from "@/services/product.service";
import type { TProductWorkItemsQuery, TProductWorkItemsResponse } from "@/types/product-work-items";

const productService = new ProductService();

/**
 * 产品「工作项」页签的一页数据 + 左栏状态组计数 + 筛选候选。
 * 翻页 / 切状态组 / 改筛选时保留上一页数据，避免表格闪成骨架。
 */
export const useProductWorkItems = ({
  workspaceSlug,
  productId,
  query,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
  query: TProductWorkItemsQuery;
}) => {
  const key =
    workspaceSlug && productId
      ? [
          "product-work-items",
          workspaceSlug,
          productId,
          query.page,
          query.per_page,
          query.state_group ?? "",
          query.search ?? "",
          query.filters ?? "",
        ]
      : null;

  const { data, error, isLoading, mutate } = useSWR<TProductWorkItemsResponse>(
    key,
    key ? () => productService.getWorkItems(workspaceSlug!, productId!, query) : null,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  return { data, isLoading, hasError: Boolean(error), mutate };
};
