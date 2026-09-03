import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="Juntaê — página inicial">
      <span className="brand-mark" aria-hidden="true">
        Jê
      </span>
      <span>Juntaê</span>
    </Link>
  );
}
