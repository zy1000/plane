import { useCallback, useEffect, useState } from "react";
import type { TRiskDetail, TUpdateRiskPayload } from "@plane/types";
import { RISK_REQUIRED_FIELDS } from "../constants";
import type { TRiskFormPatch, TRiskFormValue, TRiskRequiredField } from "../form/risk-form-state";
import { getRiskFilledMap, riskFormFromDetail, toRiskUpdatePayload } from "../form/risk-form-state";

export type TRiskEditSession = {
  isEditing: boolean;
  isSaving: boolean;
  /** 编辑中是草稿，查看时是详情本身换算出来的值 —— 正文和右栏只认这一份 */
  value: TRiskFormValue | null;
  patch: TRiskFormPatch;
  /** 点过保存后还空着的必填项，控件据此标红 */
  isMissing: (field: TRiskRequiredField) => boolean;
  start: () => void;
  cancel: () => void;
  /** 有必填项没填返回 "invalid"（不发请求），其余返回 "done" */
  save: () => Promise<"done" | "invalid">;
};

/**
 * 详情的「编辑 → 保存 / 取消」会话，口径同工作项详情：查看时全部只读，点「编辑」拿详情拷一份草稿，
 * 改动只落在草稿里；保存时只发改过的字段（一次 PATCH），成功退出编辑，失败留在编辑态；取消直接丢草稿。
 *
 * 附件、关联缺陷、评论不进会话，照旧即时生效。换了一条风险就退出编辑。
 */
export const useRiskEditSession = (
  detail: TRiskDetail | null,
  onSave: (payload: TUpdateRiskPayload) => Promise<TRiskDetail | undefined>
): TRiskEditSession => {
  const [draft, setDraft] = useState<TRiskFormValue | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const detailId = detail?.id;
  useEffect(() => {
    setDraft(null);
    setTouched(false);
  }, [detailId]);

  const start = useCallback(() => {
    if (!detail) return;
    setDraft(riskFormFromDetail(detail));
    setTouched(false);
  }, [detail]);

  const cancel = useCallback(() => {
    setDraft(null);
    setTouched(false);
  }, []);

  const patch: TRiskFormPatch = useCallback((next) => {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }, []);

  const filledMap = draft ? getRiskFilledMap(draft) : null;

  const save = async () => {
    if (!detail || !draft || !filledMap) return "done" as const;
    // 什么都没改直接退出（简道云同步来的老数据可能本来就缺必填项，不能因此卡在编辑态）
    const payload = toRiskUpdatePayload(riskFormFromDetail(detail), draft);
    if (Object.keys(payload).length === 0) {
      cancel();
      return "done" as const;
    }
    setTouched(true);
    if (RISK_REQUIRED_FIELDS.some((field) => !filledMap[field])) return "invalid" as const;
    setIsSaving(true);
    try {
      // 失败时 onSave 已弹 toast 并返回 undefined：留在编辑态，草稿不丢
      const next = await onSave(payload);
      if (next) cancel();
    } finally {
      setIsSaving(false);
    }
    return "done" as const;
  };

  return {
    isEditing: draft !== null,
    isSaving,
    value: draft ?? (detail ? riskFormFromDetail(detail) : null),
    patch,
    isMissing: (field) => Boolean(touched && filledMap && !filledMap[field]),
    start,
    cancel,
    save,
  };
};
