import { TestHubShell } from "@/components/qa/shared/testhub/testhub-shell";

// 项目下：本项目的测试计划 / 测试报告，以及关联产品的用例 / 用例评审（数据归产品，这里只是入口）
export default function TestManagementLayout() {
  return <TestHubShell scope="project" />;
}
