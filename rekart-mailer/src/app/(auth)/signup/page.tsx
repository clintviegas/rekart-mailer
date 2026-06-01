import type { Metadata } from "next";
import { AuthLayout } from "@/components/layouts/auth-layout";
import { SignupForm } from "@/modules/auth/components/signup-form";

export const metadata: Metadata = {
  title: "Create account",
};

export default function SignupPage() {
  return (
    <AuthLayout
      title="Create your account"
      description="Start sending beautiful email campaigns today"
    >
      <SignupForm />
    </AuthLayout>
  );
}
