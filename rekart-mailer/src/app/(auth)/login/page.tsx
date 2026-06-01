import type { Metadata } from "next";
import { AuthLayout } from "@/components/layouts/auth-layout";
import { LoginForm } from "@/modules/auth/components/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to your Rekart Mailer account"
    >
      <LoginForm />
    </AuthLayout>
  );
}
