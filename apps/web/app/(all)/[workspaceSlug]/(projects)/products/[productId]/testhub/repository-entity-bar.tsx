"use client";

import { useEffect, useMemo, useState } from "react";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { TestHubEntityBar } from "@/components/qa/shared/testhub-entity-bar";
import { buildRepositoryModulePathMap, useCaseRepositoryModules } from "@/hooks/store/use-case-repository-modules";
import { RepositoryService } from "@/services/qa/repository.service";
import { RepositorySelect } from "./repository-select";

const repositoryService = new RepositoryService();

type TRepositoryMeta = {
  module_id?: string | null;
  case_count?: number;
  created_by?: { id: string; display_name?: string } | null;
};

type TRepositoryEntityBarProps = {
  workspaceSlug: string;
  productId: string;
  repositoryId: string | null;
  /** 库内用例总数，跟着用例增删实时变；还没拿到时用列表接口带回的数 */
  caseTotal?: number;
  onRepositoryChange: (repository: { id: string | null; name?: string | null }) => void;
};

/**
 * 库内用例页的实体栏：「用例库 › 当前库 ▾」+ 用例数 / 所属模块 / 创建者。
 * 用例库列表页有同一条栏（只有「用例库」一级），两页靠这一行的层级区分。
 */
export function RepositoryEntityBar(props: TRepositoryEntityBarProps) {
  const { workspaceSlug, productId, repositoryId, caseTotal, onRepositoryChange } = props;
  const [repository, setRepository] = useState<TRepositoryMeta | null>(null);
  const { modules } = useCaseRepositoryModules(workspaceSlug || undefined, productId || undefined);
  const modulePathMap = useMemo(() => buildRepositoryModulePathMap(modules), [modules]);

  useEffect(() => {
    setRepository(null);
    if (!workspaceSlug || !repositoryId) return;
    let cancelled = false;
    repositoryService
      .getRepositories(workspaceSlug, { id: repositoryId })
      .then((response) => {
        if (!cancelled) setRepository(response?.data?.[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, repositoryId]);

  const total = caseTotal ?? repository?.case_count;
  const modulePath = repository?.module_id ? modulePathMap.get(repository.module_id) : undefined;
  const creator = repository?.created_by;

  return (
    <TestHubEntityBar
      meta={
        <>
          <TestHubEntityBar.Meta label="用例">{total?.toLocaleString() ?? "—"}</TestHubEntityBar.Meta>
          {modulePath && (
            <>
              <TestHubEntityBar.Divider />
              <TestHubEntityBar.Meta label="所属模块">
                <span className="max-w-[220px] truncate" title={modulePath}>
                  {modulePath}
                </span>
              </TestHubEntityBar.Meta>
            </>
          )}
          {creator?.id && (
            <>
              <TestHubEntityBar.Divider />
              <TestHubEntityBar.Meta label="创建者">
                <ButtonAvatars userIds={creator.id} size="sm" showTooltip={false} />
                {creator.display_name}
              </TestHubEntityBar.Meta>
            </>
          )}
        </>
      }
    >
      <Breadcrumbs.Item
        component={<BreadcrumbLink href={`/${workspaceSlug}/products/${productId}/testhub`} label="用例库" />}
      />
      <Breadcrumbs.Item
        component={
          <RepositorySelect
            key={`repository-select-${repositoryId || "all"}`}
            workspaceSlug={workspaceSlug}
            productId={productId}
            className="inline-flex"
            buttonClassName="min-w-0 border-0 px-1.5 py-1 text-14 font-semibold text-primary hover:bg-layer-1 cursor-pointer gap-2 h-full"
            labelClassName="max-w-[240px] leading-4"
            defaultRepositoryId={repositoryId}
            onRepositoryChange={onRepositoryChange}
          />
        }
      />
    </TestHubEntityBar>
  );
}
