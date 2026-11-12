"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { Navigate, useLocation } from "react-router";
import { Package } from "lucide-react";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { LinkedProductLoadError } from "../linked-product-select";
import { pickDefaultProduct, writeLastProduct } from "./project-case-scope";
import { tmProductBasePath, tmProjectProductBasePath } from "./route-helpers";

/** 项目一个产品都没关联：用例 / 评审页签的整页空态 */
export const NoLinkedProductState = ({ workspaceSlug, projectId }: { workspaceSlug: string; projectId: string }) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 px-10 pb-10 text-center">
    <span className="mb-3 flex size-16 items-center justify-center rounded-2xl bg-layer-1 text-secondary">
      <Package className="size-[30px]" strokeWidth={1.5} />
    </span>
    <h3 className="text-[17px] leading-snug font-semibold text-primary">项目尚未关联产品</h3>
    <p className="text-14 leading-relaxed text-secondary">测试用例在产品下维护，关联产品后可在此查看和编写。</p>
    <Link
      href={`/${workspaceSlug}/projects/${projectId}/products`}
      className="mt-3.5 inline-flex h-9 items-center justify-center rounded-lg bg-accent-primary px-[18px] text-14 font-medium text-on-color transition-colors hover:bg-accent-primary-hover"
    >
      关联产品
    </Link>
  </div>
);

type TEntryProps = {
  workspaceSlug: string;
  projectId: string;
  /** 落到产品下的哪个页面 */
  target: "cases" | "reviews";
};

/**
 * 项目「测试用例 / 用例评审」页签的入口（路径里还没带产品）：
 * 上次看的产品还关联着就回到它，否则第一个关联产品；一个都没关联给出空态。
 */
export const ProjectProductEntry = ({ workspaceSlug, projectId, target }: TEntryProps) => {
  const { links, isLoading, error } = useProjectProducts({ workspaceSlug, projectId });

  if (isLoading) return null;
  if (error) return <LinkedProductLoadError message={error} />;

  const productId = pickDefaultProduct(projectId, links);
  if (!productId) return <NoLinkedProductState workspaceSlug={workspaceSlug} projectId={projectId} />;

  return <Navigate to={`${tmProjectProductBasePath(workspaceSlug, projectId, productId)}/${target}`} replace />;
};

type TGuardProps = {
  workspaceSlug: string;
  projectId: string;
  productId: string;
  children: ReactNode;
};

/**
 * 项目里带产品 id 的页面外面套一层：
 * - 产品确实关联着：记成「上次看的产品」，下次进页签直接回到它；
 * - 产品已不在关联列表里（解除关联后的旧链接）：转到产品入口的同一个页面，链接不至于失效。
 */
export const ProjectProductGuard = ({ workspaceSlug, projectId, productId, children }: TGuardProps) => {
  const { links, isLoading, error } = useProjectProducts({ workspaceSlug, projectId });
  const location = useLocation();
  const resolved = !isLoading && !error;
  const isLinked = links.some((link) => link.product === productId);

  useEffect(() => {
    if (resolved && isLinked) writeLastProduct(projectId, productId);
  }, [resolved, isLinked, projectId, productId]);

  if (resolved && !isLinked) {
    const projectBase = tmProjectProductBasePath(workspaceSlug, projectId, productId);
    const rest = location.pathname.startsWith(projectBase) ? location.pathname.slice(projectBase.length) : "";
    return <Navigate to={`${tmProductBasePath(workspaceSlug, productId)}${rest}${location.search}`} replace />;
  }

  return <>{children}</>;
};
