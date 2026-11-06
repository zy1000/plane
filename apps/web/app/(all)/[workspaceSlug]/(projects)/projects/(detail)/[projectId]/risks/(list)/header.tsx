"use client";

import { observer } from "mobx-react";
import { Header } from "@plane/ui";
import { RISKS_HEADER_ACTIONS_ID } from "@/components/risks";

/** 子菜单名已在顶部标签栏高亮，列表页不再重复面包屑；右侧的搜索 / 筛选 / 新建由列表组件 portal 进挂点 */
export const RisksHeader = observer(function RisksHeader() {
  return (
    <Header>
      <Header.RightItem className="ml-auto shrink-0">
        <div id={RISKS_HEADER_ACTIONS_ID} className="flex items-center gap-2" />
      </Header.RightItem>
    </Header>
  );
});
