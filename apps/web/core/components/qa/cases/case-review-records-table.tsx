"use client";
import React from "react";
import { Table, Tag, Tooltip, Select } from "antd";
import { useTranslation } from "@plane/i18n";
import { CaseService } from "@/services/qa/case.service";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { qaCaseErrorContent, qaCaseSetToastError } from "@/utils/qa-case-error";
import { formatCNDateTime } from "./util";

type TReviewRecord = {
  id?: string | number;
  reason?: string | null;
  assignee?: string | null;
  result?: string;
  created_at?: string;
};

type CaseReviewRecordsTableProps = {
  workspaceSlug: string;
  caseId: string;
  /** 变化时重新拉取 */
  reloadToken?: number;
};

const getReviewResultTagColor = (label?: string) => {
  if (!label) return "default";
  if (label === "通过") return "green";
  if (label === "不通过") return "red";
  if (label === "重新提审") return "gold";
  if (label === "建议") return "orange";
  return "default";
};

const reviewPageSizeOptions = [10, 20, 50, 100];

/** 用例评审记录表：详情页（UpdateModal）与执行页共用，按 caseId 自拉数据 */
export const CaseReviewRecordsTable: React.FC<CaseReviewRecordsTableProps> = ({
  workspaceSlug,
  caseId,
  reloadToken,
}) => {
  const { t } = useTranslation();
  const caseService = React.useMemo(() => new CaseService(), []);

  const [reviewLoading, setReviewLoading] = React.useState<boolean>(false);
  const [reviewError, setReviewError] = React.useState<string | null>(null);
  const [reviewList, setReviewList] = React.useState<TReviewRecord[]>([]);
  const [reviewTotal, setReviewTotal] = React.useState<number>(0);
  const [reviewPage, setReviewPage] = React.useState<number>(1);
  const [reviewPageSize, setReviewPageSize] = React.useState<number>(10);

  React.useEffect(() => {
    if (!workspaceSlug || !caseId) return;
    let cancelled = false;
    const fetchReviewRecords = async () => {
      setReviewLoading(true);
      setReviewError(null);
      try {
        const res = await caseService.getCaseReviewRecord(String(workspaceSlug), String(caseId));
        const list = Array.isArray((res as any)?.data) ? (res as any).data : Array.isArray(res) ? (res as any) : [];
        const count = (res as any)?.count ?? list.length;
        if (cancelled) return;
        setReviewList(list);
        setReviewTotal(count);
        setReviewPage(1);
      } catch (e: any) {
        if (cancelled) return;
        const msg = qaCaseErrorContent(e, t, "获取评审记录失败");
        setReviewError(msg);
        qaCaseSetToastError(e, t, "获取评审记录失败");
      } finally {
        if (!cancelled) setReviewLoading(false);
      }
    };
    fetchReviewRecords();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, caseId, reloadToken]);

  return (
    <div>
      <div className="border-gray-200 overflow-hidden rounded">
        <div className="overflow-x-auto">
          <Table
            size="middle"
            rowKey={(r: TReviewRecord) => String(r.id ?? `${r.assignee}-${r.created_at}`)}
            dataSource={reviewList.slice((reviewPage - 1) * reviewPageSize, reviewPage * reviewPageSize)}
            loading={reviewLoading}
            pagination={{
              current: reviewPage,
              pageSize: reviewPageSize,
              total: reviewTotal,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: reviewPageSizeOptions.map(String),
              showTotal: (t, range) => `第 ${range[0]}-${range[1]} 条，共 ${t} 条`,
              selectComponentClass: (props: any) => <Select {...props} dropdownStyle={{ zIndex: 1200 }} />,
              onChange: (p) => setReviewPage(p),
              onShowSizeChange: (_c, s) => {
                setReviewPageSize(s);
                setReviewPage(1);
              },
            }}
            columns={[
              {
                title: "评审名称",
                dataIndex: "review_name",
                key: "review_name",
                width: 200,
                render: (v: string | null | undefined) => (
                  <Tooltip title={v || "-"} zIndex={1300}>
                    <span className="block max-w-[200px] truncate">{v || "-"}</span>
                  </Tooltip>
                ),
              },
              {
                title: "评审结果",
                dataIndex: "result",
                key: "result",
                width: 160,
                render: (label: string) => <Tag color={getReviewResultTagColor(label)}>{label || "-"}</Tag>,
              },
              {
                title: "评审意见",
                dataIndex: "reason",
                key: "reason",
                render: (v: string | null | undefined, record: TReviewRecord) => {
                  const isPassed = record.result === "通过" || record.result === "passed";
                  const text = isPassed && !v ? "OK" : v || "-";
                  return (
                    <Tooltip title={text} zIndex={1300}>
                      <span className="block max-w-[420px] truncate">{text}</span>
                    </Tooltip>
                  );
                },
              },
              {
                title: "评审人",
                dataIndex: "assignee",
                key: "assignee",
                width: 240,
                render: (uid: string | null) => (
                  <MemberDropdown
                    multiple={false}
                    value={uid ?? null}
                    onChange={() => {}}
                    disabled={true}
                    placeholder={"未知用户"}
                    className="w-full text-sm"
                    buttonContainerClassName="w-full text-left p-0 cursor-default"
                    buttonVariant="transparent-with-text"
                    buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
                    showUserDetails={true}
                    optionsClassName="z-[1200]"
                  />
                ),
              },
              {
                title: "评审时间",
                dataIndex: "created_at",
                key: "created_at",
                width: 200,
                render: (v: string) => formatCNDateTime(v),
              },
            ]}
          />
        </div>

        {reviewError && <div className="text-red-600 px-3 py-2 text-sm">{reviewError}</div>}
      </div>
    </div>
  );
};
