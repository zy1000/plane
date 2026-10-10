"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Library } from "lucide-react";
import { RepositoryCasesView } from "@/components/qa/cases/repository-cases-view";
import { qaCaseSetToastWarning } from "@/utils/qa-case-error";
import { RepositorySelect } from "../repository-select";

export default function TestCasesPage() {
  const { workspaceSlug, projectId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const [repositoryId, setRepositoryId] = useState<string | null>(repositoryIdFromUrl);
  const [repositoryName, setRepositoryName] = useState<string>("");

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
      const current = `/${ws}/projects/${projectId}/testhub/cases${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      try {
        qaCaseSetToastWarning("未检测到用例库，请选择一个用例库后自动跳回");
      } catch {}
      router.push(`/${ws}/projects/${projectId}/testhub?redirect_to=${encodeURIComponent(current)}`);
    }
  }, [repositoryId, workspaceSlug, searchParams, router]);

  return (
    <RepositoryCasesView
      workspaceSlug={String(workspaceSlug || "")}
      projectId={String(projectId || "")}
      repositoryId={repositoryId}
      repositoryName={repositoryName}
      // 用例库切换放在树头：树只管当前库
      treeHeader={
        <RepositorySelect
          key={`repository-select-${repositoryId || "all"}`}
          workspaceSlug={String(workspaceSlug || "")}
          projectId={String(projectId || "")}
          className="min-w-0 max-w-full"
          buttonClassName="h-7 min-w-0 max-w-full gap-1.5 rounded-md border-0 px-1.5 text-13 font-medium text-primary hover:bg-layer-transparent-hover"
          labelClassName="max-w-[170px] text-13 leading-4"
          leftIcon={<Library className="size-3.5 text-tertiary" strokeWidth={1.75} />}
          defaultRepositoryId={repositoryId}
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
            const pid = String(projectId || "");
            if (id) router.push(`/${ws}/projects/${pid}/testhub/cases?repositoryId=${encodeURIComponent(String(id))}`);
            else router.push(`/${ws}/projects/${pid}/testhub/cases`);
          }}
        />
      }
    />
  );
}
