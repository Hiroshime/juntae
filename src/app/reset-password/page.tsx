import { AuthLayout } from "@/features/auth/auth-layout";
import { ResetPasswordForm } from "@/features/auth/password-reset-forms";

export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <div className="eyebrow">Segurança da conta</div>
      <h1>Crie uma nova senha</h1>
      <p className="muted">
        Use pelo menos 8 caracteres e evite reutilizar senhas de outros sites.
      </p>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
