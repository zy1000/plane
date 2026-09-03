/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { Loader } from "@plane/ui";

/** 单个字段骨架：label 一行 + 控件一块，尺寸对齐 ProjectDetailsForm 的 h-10 控件 */
function FieldSkeleton(props: { span2?: boolean; height?: string }) {
  const { span2 = false, height = "40px" } = props;
  return (
    <div className={span2 ? "md:col-span-2" : undefined}>
      <Loader>
        <Loader.Item height="14px" width="72px" />
      </Loader>
      <Loader className="mt-1.5">
        <Loader.Item height={height} width="100%" />
      </Loader>
    </div>
  );
}

/** 与 ProjectDetailsForm 同结构的两列平铺骨架：5 行字段 + 描述整行 + 可见性 / PMS + 时区 */
export function ProjectDetailsFormLoader() {
  return (
    <div className="my-8 space-y-8">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        {Array.from({ length: 10 }, (_, index) => (
          <FieldSkeleton key={index} />
        ))}
        <FieldSkeleton span2 height="120px" />
        <FieldSkeleton />
        <FieldSkeleton />
        <FieldSkeleton />
      </div>
      <div className="flex items-center justify-between py-2">
        <Loader className="mt-2 w-full">
          <Loader.Item height="34px" width="100px" />
        </Loader>
      </div>
    </div>
  );
}
