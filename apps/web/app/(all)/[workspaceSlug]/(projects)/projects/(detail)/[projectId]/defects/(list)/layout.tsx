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

export default function ProjectDefectsLayout() {
  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const clearingPresetPathnameRef = useRef<string>();
  const [initializedPathname, setInitializedPathname] = useState<string | null>(() =>
    searchParams.has(DEFECT_PRESET_PARAM) ? null : pathname
  );

  useEffect(() => {
    if (initializedPathname === pathname) return;

    const params = new URLSearchParams(searchParams.toString());
    if (params.has(DEFECT_PRESET_PARAM)) {
      if (clearingPresetPathnameRef.current === pathname) return;
      clearingPresetPathnameRef.current = pathname;
      params.delete(DEFECT_PRESET_PARAM);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
      return;
    }

    setInitializedPathname(pathname);
  }, [initializedPathname, pathname, router, searchParams]);

  if (initializedPathname !== pathname) return null;

  return (
    <>
      <AppHeader header={<ProjectDefectsHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
