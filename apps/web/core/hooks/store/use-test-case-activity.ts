import { useContext } from "react";
import { StoreContext } from "@/lib/store-context";
import type { ITestCaseActivityStore } from "@/store/test-case-activity.store";

export const useTestCaseActivity = (): ITestCaseActivityStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useTestCaseActivity must be used within StoreProvider");
  return context.testCaseActivity;
};
