import * as React from "react";
import { PlanService as PlanApiService } from "@/services/qa/plan.service";

export type PendingFile = { id: string; file: File };

export type UploadAllResult = {
  successCount: number;
  failedCount: number;
};

/**
 * 管理测试执行页底部"上传附件"的暂存文件：
 * 选择的文件先暂存在浏览器（不立即落库），仅在提交结果成功后再调用 uploadAll
 * 把文件真正上传并绑定到本次执行记录。
 */
export function usePendingExecutionFiles() {
  const planService = React.useMemo(() => new PlanApiService(), []);
  const [pendingFiles, setPendingFiles] = React.useState<PendingFile[]>([]);

  const add = React.useCallback((file: File) => {
    setPendingFiles((prev) => [
      ...prev,
      { id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`, file },
    ]);
  }, []);

  const remove = React.useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clear = React.useCallback(() => {
    setPendingFiles([]);
  }, []);

  const uploadAll = React.useCallback(
    async (slug: string, recordId: string, files: PendingFile[]): Promise<UploadAllResult> => {
      const results = await Promise.allSettled(
        files.map((pf) => planService.uploadExecutionFile(slug, recordId, pf.file))
      );
      const failedCount = results.filter((r) => r.status === "rejected").length;
      return { successCount: results.length - failedCount, failedCount };
    },
    [planService]
  );

  return { pendingFiles, add, remove, clear, uploadAll };
}
