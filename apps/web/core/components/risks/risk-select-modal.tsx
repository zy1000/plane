/**
 * 「关联风险」弹窗：从本项目的风险里勾一批挂到某条缺陷上。
 *
 * 风险是一次全量拉（口径同 useRisks），搜索在前端按编号 / 名称过滤。已关联的行置灰、不可勾，
 * 右侧标「已关联」——留在列表里是让人看得到这条缺陷已经挂了哪些，不用再翻区块。
 * 提交成功后清空选择并关闭；失败由调用方 toast，弹窗保持打开让人改了再提。
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import type { TRisk } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { RiskService } from "@/services/risk.service";
import { RiskLevelBadge, RiskStatusBadge } from "./badges";
import { RiskCodeLabel } from "./risk-code-label";

const riskService = new RiskService();

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  /** 已挂在这条缺陷上的风险：置灰不可勾 */
  linkedRiskIds: string[];
  onClose: () => void;
  /** 抛错即视为失败：弹窗不关、选择保留，提示由调用方负责 */
  onSubmit: (riskIds: string[]) => Promise<unknown>;
};

export const RiskSelectModal = ({ isOpen, workspaceSlug, projectId, linkedRiskIds, onClose, onSubmit }: Props) => {
  const { t } = useTranslation();
  const [risks, setRisks] = useState<TRisk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 每次打开重拉：列表页可能刚新建了风险
  useEffect(() => {
    if (!isOpen || !workspaceSlug || !projectId) return;
    let cancelled = false;
    setIsLoading(true);
    riskService
      .list(workspaceSlug, projectId)
      .then((rows) => {
        if (cancelled) return;
        setRisks([...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      })
      .catch(() => {
        if (!cancelled) setRisks([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, workspaceSlug, projectId]);

  const linkedIdSet = useMemo(() => new Set(linkedRiskIds), [linkedRiskIds]);

  const visibleRisks = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return risks;
    return risks.filter(
      (risk) => (risk.code ?? "").toLowerCase().includes(keyword) || risk.name.toLowerCase().includes(keyword)
    );
  }, [risks, searchTerm]);

  const handleClose = () => {
    onClose();
    setSearchTerm("");
    setSelectedIds(new Set());
  };

  const toggleRisk = (riskId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(riskId)) next.delete(riskId);
      else next.add(riskId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(Array.from(selectedIds));
      handleClose();
    } catch {
      // 调用方已 toast，这里只保住弹窗与选择
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      {/* 标题行 */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h3 className="text-16 font-medium text-primary">{t("risk.pick_modal.title")}</h3>
        <button
          type="button"
          aria-label={t("common.cancel")}
          onClick={handleClose}
          className="grid size-7 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-secondary"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>

      {/* 搜索：编号或名称，前端过滤 */}
      <div className="border-b border-subtle px-5 pb-3">
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary"
            aria-hidden="true"
          />
          <input
            type="text"
            className="h-9 w-full rounded-md border border-subtle bg-layer-1 pr-9 pl-9 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-primary"
            placeholder={t("risk.pick_modal.search")}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5 text-secondary hover:bg-layer-2 hover:text-primary"
            >
              <CloseIcon className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 列表 */}
      <div className="max-h-96 overflow-y-auto px-3 py-2" data-modal-wheel-scroll>
        {isLoading ? (
          <Loader className="space-y-2 p-2">
            <Loader.Item height="36px" />
            <Loader.Item height="36px" />
            <Loader.Item height="36px" />
          </Loader>
        ) : visibleRisks.length === 0 ? (
          <p className="px-3 py-8 text-center text-13 text-secondary">{t("risk.pick_modal.empty")}</p>
        ) : (
          visibleRisks.map((risk) => {
            const isLinked = linkedIdSet.has(risk.id);
            const isSelected = selectedIds.has(risk.id);
            return (
              <label
                key={risk.id}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-2 text-13 select-none",
                  isLinked ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-layer-transparent-hover",
                  isSelected && "bg-accent-primary/5"
                )}
              >
                <Checkbox checked={isSelected} disabled={isLinked} onChange={() => toggleRisk(risk.id)} />
                <RiskCodeLabel risk={risk} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-primary" title={risk.name}>
                  {risk.name}
                </span>
                <RiskLevelBadge level={risk.risk_level} />
                <RiskStatusBadge status={risk.status} />
                {isLinked && (
                  <span className="shrink-0 rounded-sm border border-subtle px-1.5 text-11 text-tertiary">
                    {t("risk.pick_modal.linked")}
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>

      {/* 页脚 */}
      <div className="flex items-center justify-between border-t border-subtle px-5 py-3">
        <span className="text-13 text-secondary">{t("risk.pick_modal.selected", { count: selectedIds.size })}</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            loading={isSubmitting}
            disabled={selectedIds.size === 0 || isSubmitting}
            onClick={() => void handleSubmit()}
          >
            {t("risk.pick_modal.submit")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
