import { TestHubShell } from "@/components/qa/shared/testhub/testhub-shell";

// 项目下只剩测试计划 / 测试报告；用例、用例库、用例评审在产品下（2026-11）
export default function TestManagementLayout() {
  return <TestHubShell scope="project" />;
}
