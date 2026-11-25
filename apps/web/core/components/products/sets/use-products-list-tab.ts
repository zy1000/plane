import { useSearchParams } from "react-router";

/** 产品管理列表页当前是不是「产品集」页签。默认（不带 tab）就是产品集，产品页签是 ?tab=products */
export const useIsProductSetsTab = () => {
  const [searchParams] = useSearchParams();
  return searchParams.get("tab") !== "products";
};
