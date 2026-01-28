"use client";

import * as React from "react";
import { Table, TableBody, TableCell, TableRow } from "@plane/propel/table";
import { Tag } from "antd";
import { renderFormattedDate } from "@plane/utils";
import { Button } from "@plane/propel/button";
import { Unlink } from "lucide-react";
import UpdateModal from "@/components/qa/cases/update-modal";

type Props = {
  data: TestCaseItem[];
  loading: boolean;
  workspaceSlug: string;
  projectId: string;
  onDelete: (caseId: string | number) => void | Promise<void>;
  onRefresh?: () => void;
};

type TestCaseItem = {
  id: string | number;
  name: string;
  created_at?: string;
  review?: string;
  repository?: any;
};

export const QaCasesCollapsibleContent: React.FC<Props> = (props) => {
  const { data, loading, workspaceSlug, projectId, onDelete, onRefresh } = props;
  const [activeCaseId, setActiveCaseId] = React.useState<string | undefined>(undefined);
  const [isCaseModalOpen, setIsCaseModalOpen] = React.useState(false);

  const getReviewColor = (review?: string) => {
    switch (review) {
      case "通过":
        return "green";
      case "不通过":
        return "red";
      case "重新提审":
      case "建议":
        return "gold";
      case "评审中":
        return "blue";
      case "未评审":
      default:
        return "default";
    }
  };

  return (
    <div className="px-2.5 pb-2.5">
      <div className="rounded-md">
        <Table>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="h-20 grid place-items-center text-sm text-custom-text-300">加载中...</div>
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="h-20 grid place-items-center text-sm text-custom-text-300">暂无相关用例</div>
                </TableCell>
              </TableRow>
            ) : (
              data.map((item) => (
                <TableRow
                  key={String(item.id)}
                  className="hover:bg-[#f7f7f7]"
                >
                  <TableCell
                    className="max-w-[360px] truncate cursor-pointer"
                    title={item.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCaseId(String(item.id));
                      setIsCaseModalOpen(true);
                    }}
                  >
                    {item.name ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Tag color={getReviewColor(item.review)} className="inline-flex justify-center w-[55px]">
                      {item.review || "-"}
                    </Tag>
                  </TableCell>
                  <TableCell>{item.created_at ? renderFormattedDate(item.created_at) : "-"}</TableCell>
                  <TableCell className="w-10">
                    <Button
                      variant="neutral-primary"
                      size="sm"
                      className="p-1 rounded-md border-none !bg-transparent shadow-none hover:!bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id);
                      }}
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <UpdateModal
        open={isCaseModalOpen}
        onClose={() => {
          setIsCaseModalOpen(false);
          setActiveCaseId(undefined);
          onRefresh?.();
        }}
        caseId={activeCaseId}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />
    </div>
  );
};
