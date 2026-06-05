import { useContext } from "react";
import { StoreContext } from "@/lib/store-context";
import type { ITestCaseCommentStore } from "@/store/test-case-comment.store";

export const useTestCaseComment = (): ITestCaseCommentStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useTestCaseComment must be used within StoreProvider");
  return context.testCaseComment;
};
