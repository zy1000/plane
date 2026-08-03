import useSWR from "swr";
// services
import { UserService } from "@/services/user.service";

const userService = new UserService();

const INSTANCE_ADMIN_STATUS_KEY = "CURRENT_USER_INSTANCE_ADMIN_STATUS";

/** 当前登录账号是否为实例管理员（超级管理员） */
export function useInstanceAdminStatus() {
  const { data, isLoading } = useSWR(INSTANCE_ADMIN_STATUS_KEY, () => userService.currentUserInstanceAdminStatus(), {
    revalidateOnFocus: false,
  });

  return { isInstanceAdmin: Boolean(data?.is_instance_admin), isLoading };
}
