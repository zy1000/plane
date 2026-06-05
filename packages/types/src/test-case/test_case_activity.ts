export type TTestCaseActivityActorDetail = {
  id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  avatar?: string | null;
  avatar_url?: string | null;
};

export type TTestCaseActivity = {
  id: string;
  case: string;
  actor: string | null;
  actor_detail?: TTestCaseActivityActorDetail | null;
  verb: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  old_identifier: string | null;
  new_identifier: string | null;
  comment: string;
  test_case_comment: string | null;
  epoch: number | null;
  extra?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
