import { useSearchParams } from "react-router";

/** 产品管理列表页当前是不是「产品集」页签（?tab=sets） */
export const useIsProductSetsTab = () => {
  const [searchParams] = useSearchParams();
  return searchParams.get("tab") === "sets";
};
