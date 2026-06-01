import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/layouts/auth-layout";
import { ResetPasswordForm } from "@/modules/auth/components/reset-password-form";
import { Skeleton } from "@/components/shared/skeleton-loader";

export const metadata: Metadata = {
  title: "Reset password",
};

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      description="Choose a new secure password for your account"
    >
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
