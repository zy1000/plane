"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RepositoryCasesView } from "@/components/qa/cases/repository-cases-view";
import { TESTHUB_HEADER_ACTIONS_ID } from "@/components/qa/shared/testhub-header-actions";
import { qaCaseSetToastWarning } from "@/utils/qa-case-error";
import { RepositoryEntityBar } from "../repository-entity-bar";

export default function TestCasesPage() {
  const { workspaceSlug, productId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const [repositoryId, setRepositoryId] = useState<string | null>(repositoryIdFromUrl);
  const [repositoryName, setRepositoryName] = useState<string>("");
  const [caseTotal, setCaseTotal] = useState<number | undefined>(undefined);
  // 本页操作（搜索 / 筛选 / 新建 / 导入导出）挂到页签行右侧，正文第一行留给实体栏
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setToolbarHost(document.getElementById(TESTHUB_HEADER_ACTIONS_ID));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedId = sessionStorage.getItem("selectedRepositoryId");
      const storedName = sessionStorage.getItem("selectedRepositoryName");
      if (!repositoryIdFromUrl && storedId) {
        setRepositoryId(storedId);
      }
      if (storedName) {
        setRepositoryName(storedName);
      }
    }
  }, [repositoryIdFromUrl]);

  // URL 携带 repositoryId 时持久化到 sessionStorage（与原页面在 repositoryId 变化时的写入保持一致）
  useEffect(() => {
    if (!repositoryId) return;
    try {
      if (repositoryIdFromUrl) sessionStorage.setItem("selectedRepositoryId", repositoryIdFromUrl);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryId]);

  useEffect(() => {
    if (!repositoryId && workspaceSlug) {
      const ws = String(workspaceSlug || "");
      const current = `/${ws}/products/${productId}/testhub/cases${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      try {
        qaCaseSetToastWarning("未检测到用例库，请选择一个用例库后自动跳回");
      } catch {}
      router.push(`/${ws}/products/${productId}/testhub?redirect_to=${encodeURIComponent(current)}`);
    }
  }, [repositoryId, workspaceSlug, searchParams, router]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* 实体栏：当前在哪个用例库（切换用例库也在这里） */}
      <RepositoryEntityBar
        workspaceSlug={String(workspaceSlug || "")}
        productId={String(productId || "")}
        repositoryId={repositoryId}
        caseTotal={caseTotal}
        onRepositoryChange={({ id, name }) => {
          setRepositoryId(id);
          setRepositoryName(name ? String(name) : "");
          try {
            if (id) {
              sessionStorage.setItem("selectedRepositoryId", String(id));
              if (name) sessionStorage.setItem("selectedRepositoryName", String(name));
            } else {
              sessionStorage.removeItem("selectedRepositoryId");
              sessionStorage.removeItem("selectedRepositoryName");
            }
          } catch {}
          const ws = String(workspaceSlug || "");
          const pid = String(productId || "");
          if (id) router.push(`/${ws}/products/${pid}/testhub/cases?repositoryId=${encodeURIComponent(String(id))}`);
          else router.push(`/${ws}/products/${pid}/testhub/cases`);
        }}
      />
      <div className="min-h-0 flex-1">
        <RepositoryCasesView
          workspaceSlug={String(workspaceSlug || "")}
          productId={String(productId || "")}
          repositoryId={repositoryId}
          repositoryName={repositoryName}
          toolbarPortalEl={toolbarHost}
          onAllTotalChange={setCaseTotal}
        />
      </div>
    </div>
  );
}
