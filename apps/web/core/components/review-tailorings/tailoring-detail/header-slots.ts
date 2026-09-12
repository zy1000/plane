import { useEffect, useState } from "react";

/**
 * 详情页顶栏的两个挂点：面包屑末尾的表名、右侧的主按钮与「⋯」菜单。
 *
 * 顶栏在 layout 里渲染，拿不到详情数据；数据与操作都在详情组件里，所以由详情组件
 * `createPortal` 进来 —— 与列表页 `REVIEW_TAILORINGS_HEADER_ACTIONS_ID` 同一个做法。
 */
export const REVIEW_TAILORING_DETAIL_TITLE_SLOT_ID = "review-tailoring-detail-title";
export const REVIEW_TAILORING_DETAIL_ACTIONS_SLOT_ID = "review-tailoring-detail-actions";

/** 挂点是 layout 渲染出来的 DOM 节点，要等挂载后才找得到 */
export const useHeaderSlot = (id: string) => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.getElementById(id)), [id]);
  return host;
};
