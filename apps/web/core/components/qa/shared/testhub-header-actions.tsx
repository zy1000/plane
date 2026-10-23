"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 测试管理页签行右侧的操作挂点。
 * 列表页（测试用例 / 测试计划 / 用例评审 / 测试报告）由页签栏自己渲染搜索 + 新建；
 * 二级页把本页操作（搜索、筛选、导出……）通过 `TestHubHeaderActions` portal 到这里，
 * 这样所有页面的操作都落在同一行同一位置，正文里不再另起工具栏。
 */
export const TESTHUB_HEADER_ACTIONS_ID = "testhub-header-actions";

export const TestHubHeaderActions = ({ children }: { children: ReactNode }) => {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById(TESTHUB_HEADER_ACTIONS_ID));
  }, []);

  if (!host) return null;
  return createPortal(children, host);
};
