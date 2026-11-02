"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Select } from "antd";
import { PackageOpen } from "lucide-react";
import type { TProductProject } from "@plane/types";
import { useProjectProducts } from "@/hooks/store/use-project-products";

/**
 * 项目里选用例的前提：用例归产品（2026-11），项目只能用「已关联产品」的用例。
 * 这个 hook 拉项目已关联的产品，并维护当前选中的那个（默认第一个）。
 */
export const useLinkedProductFilter = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const { links, isLoading, error } = useProjectProducts({ workspaceSlug, projectId });
  const [productId, setProductId] = useState<string | null>(null);

  useEffect(() => {
    setProductId((prev) =>
      prev && links.some((link) => link.product === prev) ? prev : (links[0]?.product ?? null)
    );
  }, [links]);

  // 加载失败（如没有读取权限）与「确实没关联产品」要分开提示
  const hasNoLinkedProduct = !isLoading && !error && links.length === 0;

  return { links, isLoading, error, hasNoLinkedProduct, productId, setProductId };
};

type TLinkedProductSelectProps = {
  links: TProductProject[];
  value: string | null;
  onChange: (productId: string) => void;
  className?: string;
};

/** 在项目已关联的产品里切换 */
export function LinkedProductSelect({ links, value, onChange, className }: TLinkedProductSelectProps) {
  return (
    <Select
      size="small"
      className={className}
      value={value ?? undefined}
      onChange={(next: string) => onChange(next)}
      placeholder="选择产品"
      popupMatchSelectWidth={false}
      options={links.map((link) => ({
        value: link.product,
        label: link.product_identifier ? `${link.product_name}（${link.product_identifier}）` : link.product_name,
      }))}
    />
  );
}

/** 关联产品没加载出来（接口报错）时的提示 */
export function LinkedProductLoadError({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="text-sm text-secondary">项目关联的产品加载失败，暂时选不了用例</div>
      <div className="text-13 text-tertiary">{message}</div>
    </div>
  );
}

/** 项目一个产品都没关联时的空态：用例在产品下，先去关联产品 */
export function NoLinkedProductHint({ workspaceSlug, projectId }: { workspaceSlug: string; projectId: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-layer-1 text-tertiary">
        <PackageOpen className="size-6" />
      </span>
      <div className="text-sm text-secondary">用例在产品下维护，项目需要先关联产品才能选用例</div>
      <Link
        href={`/${workspaceSlug}/projects/${projectId}/products`}
        className="text-13 font-medium text-accent-primary hover:underline"
      >
        去关联产品
      </Link>
    </div>
  );
}
