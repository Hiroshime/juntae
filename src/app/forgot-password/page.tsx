import { AuthLayout } from "@/features/auth/auth-layout";
import { ForgotPasswordForm } from "@/features/auth/password-reset-forms";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <div className="eyebrow">Segurança da conta</div>
      <h1>Esqueci minha senha</h1>
      <p className="muted">
        Informe seu e-mail. Se a conta existir, enviaremos um link seguro para criar uma nova senha.
      </p>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
