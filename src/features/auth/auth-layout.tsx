import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-wrap">
      <section className="auth-card card">
        <div className="auth-brand-row">
          <Brand />
          <ThemeSwitcher />
        </div>
        {children}
      </section>
    </main>
  );
}
