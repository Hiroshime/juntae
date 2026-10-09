import Link from "next/link";

export function CommunicationTabs({
  community,
  current,
}: {
  community: string;
  current: "feed" | "voice";
}) {
  return (
    <nav className="segmented-control communication-tabs" aria-label="Áreas de comunicação">
      <Link
        aria-current={current === "feed" ? "page" : undefined}
        href={`/app/${community}/social`}
      >
        <span aria-hidden="true">◫</span> Feed
      </Link>
      <Link
        aria-current={current === "voice" ? "page" : undefined}
        href={`/app/${community}/social/voice`}
      >
        <span aria-hidden="true">◖))</span> Voz
      </Link>
    </nav>
  );
}
