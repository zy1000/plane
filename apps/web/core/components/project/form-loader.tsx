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

/** 分区骨架：标题 + 2 列 grid，与 FormSection / getFormGridClassName("settings") 同尺寸 */
function SectionSkeleton(props: { children: React.ReactNode }) {
  return (
    <div className="space-y-3.5">
      <div className="border-b border-subtle pb-2">
        <Loader>
          <Loader.Item height="16px" width="64px" />
        </Loader>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">{props.children}</div>
    </div>
  );
}

export function ProjectDetailsFormLoader() {
  return (
    <>
      <div className="relative mt-6 h-44 w-full">
        <Loader>
          <Loader.Item height="auto" width="46px" />
        </Loader>
        <div className="absolute bottom-4 flex w-full items-end justify-between gap-3 px-4">
          <div className="flex flex-grow gap-3 truncate">
            <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-lg bg-surface-2">
              <Loader>
                <Loader.Item height="46px" width="46px" />
              </Loader>
            </div>
          </div>
          <div className="flex flex-shrink-0 justify-center">
            <Loader>
              <Loader.Item height="32px" width="108px" />
            </Loader>
          </div>
        </div>
      </div>
      <div className="my-8 space-y-8">
        {/* 基本信息：名称 / 项目 ID + 代号 / 可见性 + 所属BU / 描述 / PMS + 时区 */}
        <SectionSkeleton>
          <FieldSkeleton span2 />
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton span2 height="120px" />
          <FieldSkeleton />
          <FieldSkeleton />
        </SectionSkeleton>
        {/* 分类 */}
        <SectionSkeleton>
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton />
        </SectionSkeleton>
        {/* 团队 */}
        <SectionSkeleton>
          <FieldSkeleton />
          <FieldSkeleton />
        </SectionSkeleton>
        {/* 计划 */}
        <SectionSkeleton>
          <FieldSkeleton />
          <FieldSkeleton />
        </SectionSkeleton>
        <div className="flex items-center justify-between py-2">
          <Loader className="mt-2 w-full">
            <Loader.Item height="34px" width="100px" />
          </Loader>
        </div>
      </div>
    </>
  );
}
