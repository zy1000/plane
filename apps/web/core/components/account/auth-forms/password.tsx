/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
// icons
import { Eye, EyeOff, Info } from "lucide-react";
// plane imports
import { API_BASE_URL, E_PASSWORD_STRENGTH, AUTH_TRACKER_EVENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { Input, PasswordStrengthIndicator, Spinner } from "@plane/ui";
import { getPasswordStrength } from "@plane/utils";
// components
import { ForgotPasswordPopover } from "@/components/account/auth-forms/forgot-password-popover";
// constants
// helpers
import type { TAuthErrorInfo } from "@/helpers/authentication.helper";
import {
  EAuthModes,
  EAuthenticationErrorCodes,
  EErrorAlertType,
  authErrorHandler,
} from "@/helpers/authentication.helper";
// services
import { AuthService } from "@/services/auth.service";

type Props = {
  email: string;
  isSMTPConfigured: boolean;
  mode: EAuthModes;
  handleEmailClear: () => void;
  nextPath: string | undefined;
  setErrorInfo: (errorInfo: TAuthErrorInfo | undefined) => void;
};

type TPasswordFormValues = {
  email: string;
  password: string;
  confirm_password?: string;
};

const defaultValues: TPasswordFormValues = {
  email: "",
  password: "",
};

const authService = new AuthService();

const INPUT_CLASS_NAME =
  "h-11 w-full rounded-lg border !bg-surface-1 px-3.5 text-14 disable-autofill-style placeholder:text-placeholder focus:border-accent-strong focus:ring-[3px] focus:ring-accent-strong/15";
const LABEL_CLASS_NAME = "block text-14 font-medium text-secondary";

export const AuthPasswordForm = observer(function AuthPasswordForm(props: Props) {
  const { email, mode, nextPath, setErrorInfo } = props;
  // plane imports
  const { t, currentLocale } = useTranslation();
  const isSignIn = mode === EAuthModes.SIGN_IN;
  // ref
  const formRef = useRef<HTMLFormElement>(null);
  // states
  const [csrfPromise, setCsrfPromise] = useState<Promise<{ csrf_token: string }> | undefined>(undefined);
  const [passwordFormData, setPasswordFormData] = useState<TPasswordFormValues>({ ...defaultValues, email });
  const [showPassword, setShowPassword] = useState({
    password: false,
    retypePassword: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordInputFocused, setIsPasswordInputFocused] = useState(false);
  const [isRetryPasswordInputFocused, setIsRetryPasswordInputFocused] = useState(false);
  const [isBannerMessage, setBannerMessage] = useState(false);
  // 登录时空着提交的字段；按钮不置灰，改为点了再提示
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof TPasswordFormValues, boolean>>>({});

  const handleShowPassword = (key: keyof typeof showPassword) =>
    setShowPassword((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleFormChange = (key: keyof TPasswordFormValues, value: string) => {
    setPasswordFormData((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: false } : prev));
  };

  useEffect(() => {
    if (csrfPromise === undefined) {
      const promise = authService.requestCSRFToken();
      setCsrfPromise(promise);
    }
  }, [csrfPromise]);

  const passwordSupport =
    mode === EAuthModes.SIGN_IN ? (
      <div className="w-full">
        {/* {isSMTPConfigured ? (
          <Link
            data-ph-element={AUTH_TRACKER_ELEMENTS.FORGOT_PASSWORD_FROM_SIGNIN}
            href={`/accounts/forgot-password?email=${encodeURIComponent(email)}`}
            className="text-11 font-medium text-accent-primary"
          >
            {t("auth.common.forgot_password")}
          </Link>
        ) : (
          <ForgotPasswordPopover />
        )} */}
      </div>
    ) : (
      passwordFormData.password.length > 0 &&
      getPasswordStrength(passwordFormData.password) != E_PASSWORD_STRENGTH.STRENGTH_VALID && (
        <PasswordStrengthIndicator password={passwordFormData.password} isFocused={isPasswordInputFocused} />
      )
    );

  const isButtonDisabled = useMemo(
    () =>
      !isSubmitting &&
      !!passwordFormData.email &&
      !!passwordFormData.password &&
      (mode === EAuthModes.SIGN_UP ? passwordFormData.password === passwordFormData.confirm_password : true)
        ? false
        : true,
    [isSubmitting, mode, passwordFormData.confirm_password, passwordFormData.password, passwordFormData.email]
  );

  const password = passwordFormData?.password ?? "";
  const confirmPassword = passwordFormData?.confirm_password ?? "";
  const renderPasswordMatchError = !isRetryPasswordInputFocused || confirmPassword.length >= password.length;

  const handleCSRFToken = async () => {
    if (!formRef || !formRef.current) return;
    const token = await csrfPromise;
    if (!token?.csrf_token) return;
    const csrfElement = formRef.current.querySelector("input[name=csrfmiddlewaretoken]");
    csrfElement?.setAttribute("value", token?.csrf_token);
  };

  // 登录走后台提交：失败时原地提示，不整页重载；成功后整页跳到后端给的落地地址
  const handleSignIn = async () => {
    const errors = { email: !passwordFormData.email.trim(), password: !passwordFormData.password };
    if (errors.email || errors.password) {
      setFieldErrors(errors);
      formRef.current?.querySelector<HTMLInputElement>(errors.email ? "#email" : "#password")?.focus();
      return;
    }
    setIsSubmitting(true);
    setErrorInfo(undefined);
    try {
      const token = await csrfPromise;
      const { redirect_url } = await authService.signIn({
        csrfToken: token?.csrf_token ?? "",
        email: passwordFormData.email,
        password: passwordFormData.password,
        nextPath,
      });
      window.location.assign(redirect_url);
    } catch (error) {
      const errorCode = (error as { error_code?: string | number } | undefined)?.error_code?.toString();
      setErrorInfo(
        authErrorHandler(errorCode as EAuthenticationErrorCodes) ?? {
          type: EErrorAlertType.BANNER_ALERT,
          code: EAuthenticationErrorCodes.AUTHENTICATION_FAILED_SIGN_IN,
          title: "",
          message: t("something_went_wrong_please_try_again"),
        }
      );
      setPasswordFormData((prev) => ({ ...prev, password: "" }));
      setIsSubmitting(false);
      formRef.current?.querySelector<HTMLInputElement>("#password")?.focus();
    }
  };

  return (
    <>
      {isBannerMessage && mode === EAuthModes.SIGN_UP && (
        <div className="relative flex items-center gap-2 rounded-md border border-danger-strong/50 bg-danger-subtle p-2">
          <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            <Info size={16} className="text-danger-primary" />
          </div>
          <div className="w-full text-13 font-medium text-danger-primary">
            {t("auth.sign_up.errors.password.strength")}
          </div>
          <button
            type="button"
            className="relative ml-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded-xs text-accent-primary/80 transition-all hover:bg-danger-subtle-hover"
            onClick={() => setBannerMessage(false)}
          >
            <CloseIcon className="h-4 w-4 shrink-0 text-danger-primary" />
          </button>
        </div>
      )}
      <form
        ref={formRef}
        className="space-y-5"
        method="POST"
        action={`${API_BASE_URL}/auth/${mode === EAuthModes.SIGN_IN ? "sign-in" : "sign-up"}/`}
        onSubmit={async (event) => {
          event.preventDefault(); // Prevent form from submitting by default
          if (isSignIn) {
            await handleSignIn();
            return;
          }
          await handleCSRFToken();
          const isPasswordValid =
            mode === EAuthModes.SIGN_UP
              ? getPasswordStrength(passwordFormData.password) === E_PASSWORD_STRENGTH.STRENGTH_VALID
              : true;
          if (isPasswordValid) {
            setIsSubmitting(true);
            if (formRef.current) formRef.current.submit(); // Manually submit the form if the condition is met
          } else {
            setBannerMessage(true);
          }
        }}
        onError={() => {
          setIsSubmitting(false);
        }}
      >
        <input type="hidden" name="csrfmiddlewaretoken" />
        {nextPath && <input type="hidden" value={nextPath} name="next_path" />}
        <div className="space-y-2">
          <label htmlFor="email" className={LABEL_CLASS_NAME}>
            {isSignIn ? t("auth.common.account.label") : t("auth.common.email.label")}
          </label>
          <Input
            id="email"
            name="email"
            type="text"
            value={passwordFormData.email}
            onChange={(e) => handleFormChange("email", e.target.value)}
            placeholder={isSignIn ? t("auth.common.account.placeholder") : t("auth.common.email.placeholder")}
            className={`${INPUT_CLASS_NAME} ${fieldErrors.email ? "border-danger-strong" : "border-strong"}`}
            autoFocus={!email}
          />
          {fieldErrors.email && (
            <p className="text-13 text-danger-primary">{t("auth.common.account.errors.required")}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className={LABEL_CLASS_NAME}>
            {mode === EAuthModes.SIGN_IN ? t("auth.common.password.label") : t("auth.common.password.set_password")}
          </label>
          <div className="relative flex items-center">
            <Input
              type={showPassword?.password ? "text" : "password"}
              id="password"
              name="password"
              value={passwordFormData.password}
              onChange={(e) => handleFormChange("password", e.target.value)}
              placeholder={t("auth.common.password.placeholder")}
              className={`${INPUT_CLASS_NAME} pr-12 ${fieldErrors.password ? "border-danger-strong" : "border-strong"}`}
              onFocus={() => setIsPasswordInputFocused(true)}
              onBlur={() => setIsPasswordInputFocused(false)}
              autoComplete="off"
              autoFocus={!!email}
            />
            <button
              type="button"
              onClick={() => handleShowPassword("password")}
              className="absolute right-3 grid size-5 place-items-center"
              aria-label={t(
                showPassword?.password ? "aria_labels.auth_forms.hide_password" : "aria_labels.auth_forms.show_password"
              )}
            >
              {showPassword?.password ? (
                <EyeOff className="size-5 stroke-placeholder" />
              ) : (
                <Eye className="size-5 stroke-placeholder" />
              )}
            </button>
          </div>
          {fieldErrors.password && (
            <p className="text-13 text-danger-primary">{t("auth.common.password.errors.empty")}</p>
          )}
          {passwordSupport}
        </div>

        {mode === EAuthModes.SIGN_UP && (
          <div className="space-y-2">
            <label htmlFor="confirm-password" className={LABEL_CLASS_NAME}>
              {t("auth.common.password.confirm_password.label")}
            </label>
            <div className="relative flex items-center">
              <Input
                type={showPassword?.retypePassword ? "text" : "password"}
                id="confirm-password"
                name="confirm_password"
                value={passwordFormData.confirm_password}
                onChange={(e) => handleFormChange("confirm_password", e.target.value)}
                placeholder={t("auth.common.password.confirm_password.placeholder")}
                className={`${INPUT_CLASS_NAME} border-strong pr-12`}
                onFocus={() => setIsRetryPasswordInputFocused(true)}
                onBlur={() => setIsRetryPasswordInputFocused(false)}
                autoComplete="off"
              />
              <button
                type="button"
                className="absolute right-3 grid size-5 place-items-center"
                aria-label={t(
                  showPassword?.retypePassword
                    ? "aria_labels.auth_forms.hide_password"
                    : "aria_labels.auth_forms.show_password"
                )}
                onClick={() => handleShowPassword("retypePassword")}
              >
                {showPassword?.retypePassword ? (
                  <EyeOff className="size-5 stroke-placeholder" />
                ) : (
                  <Eye className="size-5 stroke-placeholder" />
                )}
              </button>
            </div>
            {!!passwordFormData.confirm_password &&
              passwordFormData.password !== passwordFormData.confirm_password &&
              renderPasswordMatchError && (
                <span className="text-13 text-danger-primary">{t("auth.common.password.errors.match")}</span>
              )}
          </div>
        )}

        <div className="space-y-5 pt-2">
          {mode === EAuthModes.SIGN_IN ? (
            <>
              <Button
                type="submit"
                variant="primary"
                className="h-11 w-full rounded-lg"
                size="xl"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Spinner height="20px" width="20px" />
                ) : (
                  <span
                    className={`text-16 font-semibold ${currentLocale.startsWith("zh") ? "pl-[0.25em] tracking-[0.25em]" : ""}`}
                  >
                    {t("auth.common.login")}
                  </span>
                )}
              </Button>
              <p className="text-center text-13 text-tertiary">{t("auth.common.login_help")}</p>
            </>
          ) : (
            <Button type="submit" variant="primary" className="h-11 w-full rounded-lg" size="xl" disabled={isButtonDisabled}>
              {isSubmitting ? <Spinner height="20px" width="20px" /> : "Create account"}
            </Button>
          )}
        </div>
      </form>
    </>
  );
});
