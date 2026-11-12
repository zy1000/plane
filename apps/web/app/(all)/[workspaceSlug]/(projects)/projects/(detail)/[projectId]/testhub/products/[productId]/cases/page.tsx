"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Library, Lock } from "lucide-react";
import { RepositoryCasesView } from "@/components/qa/cases/repository-cases-view";
import { TESTHUB_HEADER_ACTIONS_ID } from "@/components/qa/shared/testhub-header-actions";
import { CaseScopeSwitcher } from "@/components/qa/shared/testhub/case-scope-switcher";
import {
  readLastRepository,
  useLinkedProductRepositories,
  writeLastRepository,
} from "@/components/qa/shared/testhub/project-case-scope";
import { tmProductBasePath, tmProjectProductBasePath } from "@/components/qa/shared/testhub/route-helpers";

/** 没有可看的用例库时：左栏仍留切换器（好换到别的产品），右侧给说明 */
const ScopeOnlyLayout = ({ switcher, children }: { switcher: ReactNode; children?: ReactNode }) => (
  <div className="flex h-full w-full">
    <div className="h-full w-60 shrink-0 border-r border-subtle bg-surface-1 px-2 pt-2.5">{switcher}</div>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

const ScopeState = ({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 px-10 pb-10 text-center">
    <span className="mb-3 flex size-16 items-center justify-center rounded-2xl bg-layer-1 text-secondary">{icon}</span>
    <h3 className="text-[17px] leading-snug font-semibold text-primary">{title}</h3>
    <p className="text-14 leading-relaxed text-secondary">{description}</p>
    {action}
  </div>
);

/**
 * 项目 › 测试 › 测试用例：看的是某个关联产品的某个用例库，数据和产品入口是同一份。
 * 与产品入口的区别只在外壳：左栏顶部是「产品 + 用例库」切换器，本页操作挂到页签行右侧。
 */
export default function ProjectProductCasesPage() {
  const { workspaceSlug, projectId, productId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ws = String(workspaceSlug || "");
  const project = String(projectId || "");
  const product = String(productId || "");
  const repositoryIdFromUrl = searchParams.get("repositoryId");

  const { groups, repositoriesLoading } = useLinkedProductRepositories(ws || undefined, project || undefined);
  const group = groups.find((item) => item.productId === product);
  const repositories = group?.repositories;
  const listReady = Boolean(group) && !repositoriesLoading;
  const currentRepository = repositories?.find((repository) => repository.id === repositoryIdFromUrl);

  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setToolbarHost(document.getElementById(TESTHUB_HEADER_ACTIONS_ID));
  }, []);

  // 链接里没带用例库（或带的库不属于这个产品）：回到上次看的库，没有就第一个
  useEffect(() => {
    if (!listReady || !repositories || currentRepository) return;
    const last = readLastRepository(product);
    const next = repositories.find((repository) => repository.id === last) ?? repositories[0];
    if (!next) return;
    const params = new URLSearchParams(searchParams.toString());
    // 原来的库不作数了，跟着它的模块定位也一起丢掉
    if (repositoryIdFromUrl) params.delete("moduleId");
    params.set("repositoryId", next.id);
    router.replace(`${tmProjectProductBasePath(ws, project, product)}/cases?${params.toString()}`);
  }, [listReady, repositories, currentRepository, product, project, ws, repositoryIdFromUrl, searchParams, router]);

  // 记住这次看的库；脑图页等仍从 sessionStorage 取当前库
  useEffect(() => {
    if (!currentRepository) return;
    writeLastRepository(product, currentRepository.id);
    try {
      sessionStorage.setItem("selectedRepositoryId", currentRepository.id);
      sessionStorage.setItem("selectedRepositoryName", currentRepository.name);
    } catch {}
  }, [currentRepository, product]);

  if (!ws || !project || !product) return null;

  const switcher = (
    <CaseScopeSwitcher
      workspaceSlug={ws}
      projectId={project}
      groups={groups}
      productId={product}
      mode="repository"
      repositoryId={repositoryIdFromUrl}
      loading={repositoriesLoading}
      onSelect={({ productId: nextProduct, repositoryId: nextRepository }) => {
        const query = nextRepository ? `?repositoryId=${encodeURIComponent(nextRepository)}` : "";
        router.push(`${tmProjectProductBasePath(ws, project, nextProduct)}/cases${query}`);
      }}
    />
  );

  if (listReady && repositories && repositories.length === 0) {
    return (
      <ScopeOnlyLayout switcher={switcher}>
        {group?.failed ? (
          <ScopeState
            icon={<Lock className="size-[30px]" strokeWidth={1.5} />}
            title="无权查看该产品的用例"
            description="需要该产品的用例查看权限。"
          />
        ) : (
          <ScopeState
            icon={<Library className="size-[30px]" strokeWidth={1.5} />}
            title="该产品暂无用例库"
            description="用例库在产品的「测试」页中创建。"
            action={
              <Link
                href={tmProductBasePath(ws, product)}
                className="mt-3.5 inline-flex h-9 items-center justify-center rounded-lg bg-accent-primary px-[18px] text-14 font-medium text-on-color transition-colors hover:bg-accent-primary-hover"
              >
                前往产品
              </Link>
            }
          />
        )}
      </ScopeOnlyLayout>
    );
  }

  // 用例库还没定下来（等列表回来后由上面的 effect 补进链接）
  if (!repositoryIdFromUrl) return <ScopeOnlyLayout switcher={switcher} />;

  return (
    <RepositoryCasesView
      // 换库 / 换产品整体重来：选中的模块、勾选、筛选都是跟着库走的
      key={`${product}:${repositoryIdFromUrl}`}
      workspaceSlug={ws}
      productId={product}
      repositoryId={repositoryIdFromUrl}
      repositoryName={currentRepository?.name ?? ""}
      treeTop={switcher}
      toolbarPortalEl={toolbarHost}
    />
  );
}
