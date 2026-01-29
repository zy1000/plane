"use client";
import React from "react";
import { Button, Select, Spin, Tag, Tooltip } from "antd";
import { FolderOutlined } from "@ant-design/icons";
import { useParams } from "next/navigation";
import { formatCNDateTime } from "../util";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { CaseVersionCompareModal } from "./case-version-compare-modal";

type SideInfoPanelProps = {
  caseData: any;
  caseVersions: { id: string; version: number; created_at?: string }[];
  loadingCaseVersions: boolean;
  enumsData: {
    case_test_type?: Record<string, string>;
    case_type?: Record<string, string>;
    case_priority?: Record<string, string>;
    case_state?: Record<string, string>;
    plan_case_result?: Record<string, string>;
  };
  reviewEnums: Record<string, Record<string, { label: string; color: string }>>;
  latestExec: {
    id?: string | number;
    name?: string;
    result?: string;
    created_by?: string | null;
    created_at?: string;
  } | null;
  onChangeTestType: (v: string) => void | Promise<void>;
};

export function SideInfoPanel({
  caseData,
  caseVersions,
  loadingCaseVersions,
  enumsData,
  reviewEnums,
  latestExec,
  onChangeTestType,
}: SideInfoPanelProps) {
  const { workspaceSlug } = useParams() as { workspaceSlug?: string };

  const latestVersion = React.useMemo(() => {
    return -1;
  }, [caseVersions]);

  const currentVersionLabel = React.useMemo(() => {
    return caseData?.version ? `V${caseData.version}` : "最新";
  }, [caseData?.version]);

  const [compareOpen, setCompareOpen] = React.useState(false);

  const normalizeId = (v: any): string | undefined => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "object") {
      const id = (v as any).id ?? (v as any).value ?? (v as any).uuid;
      return id ? String(id) : undefined;
    }
    return String(v);
  };

  const [testTypeValue, setTestTypeValue] = React.useState<string | undefined>(undefined);
  const optionsReady = React.useMemo(
    () => Object.keys(enumsData.case_test_type || {}).length > 0,
    [enumsData.case_test_type]
  );
  React.useEffect(() => {
    if (!optionsReady) return;
    setTestTypeValue(normalizeId(caseData?.test_type));
  }, [caseData?.test_type, optionsReady]);

  const colorForLabel = (text: string) => {
    if (text && text.includes("手动")) return "bg-blue-500";
    if (text && text.includes("自动")) return "bg-green-500";
    return "bg-gray-300";
  };

  const buildLabelNode = (text: string) => (
    <span className="inline-flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${colorForLabel(text)}`} />
      <span className="truncate">{text}</span>
    </span>
  );

  const caseTestTypeOptions = React.useMemo(
    () =>
      Object.entries(enumsData.case_test_type || {}).map(([value, text]) => ({
        value,
        label: buildLabelNode(String(text)),
      })),
    [enumsData.case_test_type]
  );

  const handleChangeTestType = async (v: string) => {
    setTestTypeValue(v);
    await onChangeTestType(v);
  };

  return (
    <div className="w-[27%] border-l px-6 py-4 h-full overflow-y-auto bg-[#FAFAFA] divide-y divide-gray-100">
      {workspaceSlug && caseData?.id ? (
        <CaseVersionCompareModal
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
          workspaceSlug={String(workspaceSlug)}
          caseId={String(caseData?.id)}
          caseVersions={caseVersions}
          latestVersion={latestVersion}
          currentVersionLabel={currentVersionLabel}
          enumsData={enumsData}
        />
      ) : null}
      <div className="py-5">
        <div className="text-xs text-gray-500 mb-4">属性</div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm font-medium text-gray-700 shrink-0 basis-28 md:basis-32">测试类型</span>
            {optionsReady ? (
              <div
                className={
                  "flex-1 min-w-0 rounded-md border border-transparent transition-colors duration-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-100"
                }
              >
                <Select
                  className="w-full"
                  bordered={false}
                  suffixIcon={null}
                  options={caseTestTypeOptions}
                  value={testTypeValue}
                  onChange={handleChangeTestType}
                  placeholder="请选择测试类型"
                  aria-label="测试类型"
                  dropdownStyle={{ zIndex: 1200 }}
                />
              </div>
            ) : (
              <div className="flex-1 min-w-0 h-8 flex items-center">
                <Spin size="small" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="py-5">
        <div className="text-xs text-gray-500 mb-4">变更</div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">版本</span>
            <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
              <span className="text-sm text-gray-900 truncate">
                {loadingCaseVersions ? "加载中..." : currentVersionLabel}
              </span>
              <Button
                size="small"
                type="link"
                disabled={loadingCaseVersions || (caseVersions || []).length <= 0}
                onClick={() => setCompareOpen(true)}
              >
                版本对比
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">评审状态</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
              {(() => {
                const v = String(caseData?.review ?? "-");
                const color = (reviewEnums?.CaseReviewThrough_Result?.[v]?.color as any) || "default";
                return <Tag color={color}>{v || "-"}</Tag>;
              })()}
            </span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">基线</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">-</span>
          </div>
        </div>
      </div>

      <div className="py-5">
        <div className="text-xs text-gray-500 mb-4">最近执行</div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">计划</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">{latestExec?.name ?? "-"}</span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">结果</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
              {(() => {
                const label = latestExec?.result ?? "";
                const color = (enumsData?.plan_case_result || {})[label];
                return label ? <Tag color={color}>{label}</Tag> : "-";
              })()}
            </span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">执行人</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
              {latestExec?.created_by ? (
                <MemberDropdown
                  multiple={false}
                  value={latestExec?.created_by ?? null}
                  onChange={() => {}}
                  disabled={true}
                  placeholder="未知用户"
                  className="w-full text-sm"
                  buttonContainerClassName="w-full text-left p-0 cursor-default"
                  buttonVariant="transparent-with-text"
                  buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
                  showUserDetails={true}
                  optionsClassName="z-[1200]"
                />
              ) : (
                "-"
              )}
            </span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">时间</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
              {latestExec?.created_at ? formatCNDateTime(latestExec.created_at) : "-"}
            </span>
          </div>
        </div>
      </div>

      <div className="py-5">
        <div className="text-xs text-gray-500 mb-4">工时</div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">预估工时</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">-</span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">登记工时</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">-</span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">剩余工时</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">-</span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">工时进度</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">-</span>
          </div>
        </div>
      </div>

      <div className="py-5">
        <div className="text-xs text-gray-500 mb-4">基础信息</div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">用例库</span>
            <Tooltip
              title={caseData?.repository_name ?? "-"}
              placement="top"
              overlayStyle={{ zIndex: 2000 }}
              getPopupContainer={(trigger) => trigger?.parentElement ?? document.body}
            >
              <span className="text-sm text-gray-900 flex-1 min-w-0 truncate inline-flex items-center gap-2">
                <FolderOutlined className="text-blue-500" />
                <span className="truncate">{caseData?.repository_name ?? "-"}</span>
              </span>
            </Tooltip>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">创建人</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
              {
                <MemberDropdown
                  multiple={false}
                  value={caseData?.created_by ?? null}
                  onChange={(val) => {}}
                  disabled={true}
                  placeholder="请选择维护人"
                  className="w-full text-sm"
                  buttonContainerClassName="w-full text-left"
                  buttonVariant="transparent-with-text"
                  buttonClassName="text-sm"
                  showUserDetails={true}
                  optionsClassName="z-[1200]"
                />
              }
            </span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">创建时间</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
              {formatCNDateTime(caseData?.created_at)}
            </span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">更新人</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
              {
                <MemberDropdown
                  multiple={false}
                  value={caseData?.updated_by ?? null}
                  onChange={(val) => {}}
                  disabled={true}
                  placeholder="请选择维护人"
                  className="w-full text-sm"
                  buttonContainerClassName="w-full text-left"
                  buttonVariant="transparent-with-text"
                  buttonClassName="text-sm"
                  showUserDetails={true}
                  optionsClassName="z-[1200]"
                />
              }
            </span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <span className="text-sm text-gray-700 shrink-0 basis-28 md:basis-32">更新时间</span>
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
              {formatCNDateTime(caseData?.updated_at)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
