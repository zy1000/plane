import { useEffect, useState } from "react";

/** 列表页路由 header 里留的两个空挂点，列表组件把数量徽章与搜索 / 筛选 / 显示 portal 进去 */
export const STAGE_REVIEWS_HEADER_ACTIONS_ID = "stage-reviews-header-actions";
export const STAGE_REVIEWS_HEADER_COUNT_ID = "stage-reviews-header-count";

/** 独立详情页顶栏的两个挂点：面包屑末尾的评审标题、右侧的保存状态。顶栏在 layout 里，拿不到详情数据 */
export const STAGE_REVIEW_DETAIL_HEADER_TITLE_ID = "stage-review-detail-header-title";
export const STAGE_REVIEW_DETAIL_HEADER_ACTIONS_ID = "stage-review-detail-header-actions";

/** 挂点是 layout 渲染出来的 DOM 节点，要等挂载后才找得到；不在那个路由下（抽屉里）就是 null */
export const useStageReviewHeaderSlot = (id: string) => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.getElementById(id)), [id]);
  return host;
};
