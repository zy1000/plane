"use client";

import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { observer } from "mobx-react";
// ui
import { Button } from "@plane/propel/button";
import { Input, ToggleSwitch } from "@plane/ui";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
// services
import { InstanceService } from "@/services/instance.service";
// hooks
import { useUser } from "@/hooks/store/user";

const instanceService = new InstanceService();

export const LdapConfiguration = observer(() => {
  const { data: currentUser } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const { control, handleSubmit, setValue, reset, watch } = useForm({
    defaultValues: {
      server_url: "",
      bind_dn: "",
      bind_password: "",
      base_dn: "",
      user_search_filter: "(mail=%(user)s)",
      is_active: false,
    },
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await instanceService.getLdapConfig();
        if (data && Object.keys(data).length > 0) {
          reset(data);
        }
      } catch (error) {
        console.error(error);
      }
    };
    fetchConfig();
  }, [reset]);

  const onSubmit = async (data: any) => {
    setIsLoading(true);
    try {
      await instanceService.updateLdapConfig(data);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "LDAP configuration updated successfully",
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Failed to update LDAP configuration",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    const formData = watch();
    try {
      await instanceService.testLdapConnection(formData);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "LDAP connection successful",
      });
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: error?.response?.data?.message || "LDAP connection failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Only show for admins (simple client-side check, real check is on API)
  // Assuming role 20 is Admin based on backend models
  // currentUser.role might be workspace role, but we need instance role. 
  // For now, we render it, API will block if not allowed.

  return (
    <div className="w-full max-w-2xl py-6">
      <div className="mb-6">
        <h3 className="text-xl font-medium text-custom-text-100">LDAP Configuration</h3>
        <p className="text-sm text-custom-text-300">Configure LDAP for single sign-on.</p>
      </div>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
            <Controller
                name="is_active"
                control={control}
                render={({ field: { value, onChange } }) => (
                    <div className="flex items-center justify-between p-4 border border-custom-border-200 rounded-md">
                        <div>
                            <div className="text-sm font-medium text-custom-text-100">Enable LDAP</div>
                            <div className="text-xs text-custom-text-300">Enable LDAP authentication for this instance</div>
                        </div>
                        <ToggleSwitch value={value} onChange={onChange} />
                    </div>
                )}
            />

            <div className="grid grid-cols-1 gap-6">
                <Controller
                    name="server_url"
                    control={control}
                    rules={{ required: "Server URL is required" }}
                    render={({ field, fieldState: { error } }) => (
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-custom-text-200">Server URL <span className="text-red-500">*</span></label>
                            <Input {...field} placeholder="ldap://10.32.232.191:389" className="w-full" hasError={!!error} />
                            {error && <span className="text-xs text-red-500">{error.message}</span>}
                        </div>
                    )}
                />

                <Controller
                    name="base_dn"
                    control={control}
                    rules={{ required: "Base DN is required" }}
                    render={({ field, fieldState: { error } }) => (
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-custom-text-200">Base DN <span className="text-red-500">*</span></label>
                            <Input {...field} placeholder="dc=example,dc=com" className="w-full" hasError={!!error} />
                            {error && <span className="text-xs text-red-500">{error.message}</span>}
                        </div>
                    )}
                />

                <Controller
                    name="bind_dn"
                    control={control}
                    rules={{ required: "Bind DN is required" }}
                    render={({ field, fieldState: { error } }) => (
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-custom-text-200">Bind DN <span className="text-red-500">*</span></label>
                            <Input {...field} placeholder="cn=admin,dc=example,dc=com" className="w-full" hasError={!!error} />
                            {error && <span className="text-xs text-red-500">{error.message}</span>}
                        </div>
                    )}
                />

                <Controller
                    name="bind_password"
                    control={control}
                    rules={{ required: "Bind Password is required" }}
                    render={({ field, fieldState: { error } }) => (
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-custom-text-200">Bind Password <span className="text-red-500">*</span></label>
                            <Input {...field} type="password" placeholder="******" className="w-full" hasError={!!error} />
                            {error && <span className="text-xs text-red-500">{error.message}</span>}
                        </div>
                    )}
                />

                <Controller
                    name="user_search_filter"
                    control={control}
                    render={({ field, fieldState: { error } }) => (
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-custom-text-200">User Search Filter</label>
                            <Input {...field} placeholder="(mail=%(user)s)" className="w-full" hasError={!!error} />
                            <p className="text-xs text-custom-text-300">Default: (mail=%(user)s)</p>
                            {error && <span className="text-xs text-red-500">{error.message}</span>}
                        </div>
                    )}
                />
            </div>
        </div>
        
        <div className="flex gap-4 pt-4 border-t border-custom-border-200">
            <Button variant="primary" type="submit" loading={isLoading}>
                Save Changes
            </Button>
            <Button variant="neutral-primary" type="button" onClick={handleTestConnection} loading={isTesting}>
                Test Connection
            </Button>
        </div>
      </form>
    </div>
  );
});

export default LdapConfiguration;
