import { useEffect, useMemo, useState } from "react";
import { ArrowRight, GitCompareArrows } from "lucide-react";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { CustomSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { calculateTimeAgo } from "@plane/utils";
import type { TRequirementChange, TRequirementDiff, TRequirementVersion } from "@/services/requirement.service";
import { RequirementDiffResultPanel } from "./requirement-review-panels";

type TCompareParams = {
  from_version?: number;
  to_version?: number;
  to_change_id?: string;
};

type Props = {
  isOpen: boolean;
  versions: TRequirementVersion[];
  latestChange: TRequirementChange | null;
  onClose: () => void;
  onCompare: (params: TCompareParams) => Promise<TRequirementDiff | undefined>;
};

const BASELINE_KEY = "baseline";
const PROPOSAL_KEY = "proposal";
const versionKey = (version: number) => `version:${version}`;
const versionFromKey = (key: string) => Number(key.replace("version:", ""));

export function RequirementVersionCompareModal(props: Props) {
  const { isOpen, latestChange, onClose, onCompare, versions } = props;
  const pendingChange = latestChange?.status === "pending" ? latestChange : null;
  const [sourceKey, setSourceKey] = useState(BASELINE_KEY);
  const [targetKey, setTargetKey] = useState("");
  const [diff, setDiff] = useState<TRequirementDiff>();
  const [error, setError] = useState<string>();
  const [isComparing, setIsComparing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const sourceVersion = pendingChange ? versions[0] : (versions[1] ?? versions[0]);
    setSourceKey(sourceVersion ? versionKey(sourceVersion.version) : BASELINE_KEY);
    setTargetKey(pendingChange ? PROPOSAL_KEY : versions.length > 1 ? versionKey(versions[0].version) : "");
    setDiff(undefined);
    setError(undefined);
  }, [isOpen, pendingChange, versions]);

  const sourceLabel = useMemo(() => {
    if (sourceKey === BASELINE_KEY) return "初始空白";
    return `V${versionFromKey(sourceKey)}`;
  }, [sourceKey]);

  const targetLabel = useMemo(() => {
    if (targetKey === PROPOSAL_KEY) return `第 ${pendingChange?.sequence ?? "-"} 轮变更提案`;
    if (targetKey.startsWith("version:")) return `V${versionFromKey(targetKey)}`;
    return "未选择";
  }, [pendingChange?.sequence, targetKey]);

  const canCompare =
    Boolean(targetKey) && sourceKey !== targetKey && (targetKey !== PROPOSAL_KEY || Boolean(pendingChange));

  const resetResult = () => {
    setDiff(undefined);
    setError(undefined);
  };

  const handleCompare = async () => {
    if (!canCompare) return;

    setIsComparing(true);
    setError(undefined);
    try {
      const fromVersion = sourceKey === BASELINE_KEY ? undefined : versionFromKey(sourceKey);
      const result = await onCompare(
        targetKey === PROPOSAL_KEY
          ? { from_version: fromVersion, to_change_id: pendingChange?.id }
          : { from_version: fromVersion, to_version: versionFromKey(targetKey) }
      );
      if (!result) {
        setError("无法获取版本差异，请稍后重试。");
        return;
      }
      setDiff(result);
    } catch {
      setError("版本对比失败，请稍后重试。");
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.TOP_EXTENDED}
      width={EModalWidth.VIXL}
      className="overflow-hidden"
    >
      <div className="flex h-[calc(100dvh-3rem)] min-h-[32rem] flex-col md:h-[calc(100dvh-5rem)]">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-subtle px-5 py-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-primary/10 text-accent-primary">
              <GitCompareArrows className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-16 font-semibold text-primary">版本对比</h2>
              <p className="mt-0.5 truncate text-11 text-secondary">比较已生效版本，或查看当前变更提案的差异</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-visible:ring-accent-primary/30 rounded-md p-1.5 text-secondary transition-colors hover:bg-layer-1 hover:text-primary focus-visible:ring-2 focus-visible:outline-none"
            aria-label="关闭版本对比"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="shrink-0 border-b border-subtle px-5 py-5 md:px-6">
          <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <label className="min-w-0">
              <span className="mb-2 block text-11 font-medium text-secondary">对比基线</span>
              <CustomSelect
                value={sourceKey}
                disabled={isComparing}
                onChange={(value: string) => {
                  setSourceKey(value);
                  if (targetKey === value) setTargetKey("");
                  resetResult();
                }}
                label={sourceLabel}
                buttonClassName="h-10 w-full"
              >
                {versions.length === 0 && <CustomSelect.Option value={BASELINE_KEY}>初始空白</CustomSelect.Option>}
                {versions.map((version) => (
                  <CustomSelect.Option key={version.id} value={versionKey(version.version)}>
                    V{version.version} · {calculateTimeAgo(version.created_at)}
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
            </label>

            <span className="mb-2 hidden size-8 place-items-center rounded-full border border-subtle text-tertiary md:grid">
              <ArrowRight className="size-3.5" />
            </span>

            <label className="min-w-0">
              <span className="mb-2 block text-11 font-medium text-secondary">对比目标</span>
              <CustomSelect
                value={targetKey}
                disabled={isComparing}
                onChange={(value: string) => {
                  setTargetKey(value);
                  resetResult();
                }}
                label={targetLabel}
                buttonClassName="h-10 w-full"
              >
                {pendingChange && (
                  <CustomSelect.Option value={PROPOSAL_KEY}>第 {pendingChange.sequence} 轮变更提案</CustomSelect.Option>
                )}
                {versions
                  .filter((version) => versionKey(version.version) !== sourceKey)
                  .map((version) => (
                    <CustomSelect.Option key={version.id} value={versionKey(version.version)}>
                      V{version.version} · {calculateTimeAgo(version.created_at)}
                    </CustomSelect.Option>
                  ))}
              </CustomSelect>
            </label>
          </div>
        </div>

        <div
          data-modal-wheel-scroll
          className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto p-5 md:p-6"
        >
          {error ? (
            <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-danger-subtle px-6 text-center">
              <div>
                <p className="text-13 font-medium text-danger-primary">{error}</p>
                <p className="mt-1 text-11 text-secondary">请确认所选版本后重新对比。</p>
              </div>
            </div>
          ) : diff ? (
            <RequirementDiffResultPanel diff={diff} subtitle={`${sourceLabel} 与 ${targetLabel} 的字段差异`} />
          ) : (
            <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-subtle px-6 text-center">
              <div className="max-w-sm">
                <GitCompareArrows className="mx-auto size-6 text-tertiary" />
                <p className="mt-3 text-13 font-medium text-primary">
                  {targetKey ? "选择版本后开始对比" : "暂无可对比的目标版本"}
                </p>
                <p className="mt-1 text-11 leading-5 text-secondary">
                  {targetKey
                    ? "差异会按字段逐项展示，正文和验收标准也会保留原有格式。"
                    : "需求产生新版本或进入下一轮变更评审后，可在此查看差异。"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-subtle px-5 py-4 md:px-6">
          <p className="hidden min-w-0 truncate text-11 text-secondary sm:block">
            {targetKey ? `${sourceLabel} → ${targetLabel}` : "请选择对比目标"}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={onClose}>
              关闭
            </Button>
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={!canCompare}
              loading={isComparing}
              prependIcon={<GitCompareArrows className="size-4" />}
              onClick={() => void handleCompare()}
            >
              开始对比
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
}
