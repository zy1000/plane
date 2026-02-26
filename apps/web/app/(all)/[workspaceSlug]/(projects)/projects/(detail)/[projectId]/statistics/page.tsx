"use client";

import { PageHead } from "@/components/core/page-title";

export default function ProjectStatisticsPage() {
  const pageTitle = "统计";

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="relative h-full w-full overflow-hidden overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          <div className="text-sm text-custom-text-200">暂无内容</div>
        </div>
      </div>
    </>
  );
}

