/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router";
import { usePathname, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { DEFECT_PRESET_PARAM } from "@/components/issues/defects/defect-quick-filter-bar";
import { ProjectDefectsHeader } from "@/components/issues/defects/project-defects-header";
import { useAppRouter } from "@/hooks/use-app-router";

/**
 * 归一化路径：忽略结尾斜杠差异。
 * next/navigation 兼容层的 router.push/replace 会经 ensureTrailingSlash 强制补全结尾斜杠，
 * 若直接用原始 pathname 比对，点击预设导致的斜杠变化会被误判为「重新进入页面」而清空预设。
 */
const normalizePathname = (pathname: string): string =>
  pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

export default function ProjectDefectsLayout() {
  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageKey = normalizePathname(pathname);
  const clearingPresetPathnameRef = useRef<string>();
  const [initializedPathname, setInitializedPathname] = useState<string | null>(() =>
    searchParams.has(DEFECT_PRESET_PARAM) ? null : pageKey
  );

  useEffect(() => {
    if (initializedPathname === pageKey) return;

    const params = new URLSearchParams(searchParams.toString());
    if (params.has(DEFECT_PRESET_PARAM)) {
      if (clearingPresetPathnameRef.current === pageKey) return;
      clearingPresetPathnameRef.current = pageKey;
      params.delete(DEFECT_PRESET_PARAM);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
      return;
    }

    setInitializedPathname(pageKey);
  }, [initializedPathname, pageKey, pathname, router, searchParams]);

  if (initializedPathname !== pageKey) return null;

  return (
    <>
      <AppHeader header={<ProjectDefectsHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
