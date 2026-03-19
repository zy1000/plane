export type TIssueWorkflowUpdateError = {
  error?: string;
  workflow_blocked?: boolean;
  transition_record_id?: string | null;
};

export const isWorkflowApprovalInitiated = (errorData?: TIssueWorkflowUpdateError): boolean =>
  Boolean(errorData?.workflow_blocked && errorData?.transition_record_id);
