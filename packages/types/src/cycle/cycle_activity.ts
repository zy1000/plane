export type TCycleActivityActorDetail = {
  id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  avatar?: string | null;
  avatar_url?: string | null;
};

export type TCycleActivity = {
  id: string;
  workspace: string;
  project: string;
  cycle: string;
  actor: string | null;
  actor_detail?: TCycleActivityActorDetail | null;
  verb: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  old_identifier: string | null;
  new_identifier: string | null;
  comment: string;
  cycle_comment: string | null;
  epoch: number | null;
  extra?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
