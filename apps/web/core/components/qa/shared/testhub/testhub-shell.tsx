"use client";

import { useEffect } from "react";
import { Outlet } from "react-router";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/core/app-header";
import { TestManagementMenuBar } from "./menu";
import { ProjectProductGuard } from "./project-product-entry";
import type { TTestHubScopeKind } from "./route-helpers";
import { TestHubProvider } from "./testhub-context";
import { getEnums, globalEnums } from "./util";

/** 测试管理外壳：产品下（用例 / 评审）与项目下（计划 / 报告）共用 */
export function TestHubShell({ scope }: { scope: TTestHubScopeKind }) {
  const { workspaceSlug, projectId, productId } = useParams();
  // 项目里看关联产品的用例 / 评审：路径同时带项目和产品
  const projectProduct =
    scope === "project" && workspaceSlug && projectId && productId
      ? { workspaceSlug: String(workspaceSlug), projectId: String(projectId), productId: String(productId) }
      : null;

  // 模块进入时初始化全局枚举
  useEffect(() => {
    const initializeEnums = async () => {
      if (!workspaceSlug) return;
      try {
        const enumTypes = await getEnums(workspaceSlug.toString());
        globalEnums.setEnums(enumTypes);
      } catch (e) {
        console.error("初始化测试管理枚举失败：", e);
      }
    };
    initializeEnums();
  }, [workspaceSlug]);

  return (
    <TestHubProvider>
      <AppHeader header={<TestManagementMenuBar scope={scope} />} />
      <div className="relative flex h-full w-full overflow-hidden">
        <main className="relative h-full w-full overflow-hidden bg-surface-1">
          {projectProduct ? (
            <ProjectProductGuard {...projectProduct}>
              <Outlet />
            </ProjectProductGuard>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </TestHubProvider>
  );
}
