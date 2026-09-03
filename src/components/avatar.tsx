/* eslint-disable @next/next/no-img-element */

export function Avatar({
  name,
  url,
  size = "medium",
}: {
  name: string;
  url?: string | null;
  size?: "small" | "medium" | "large";
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={`avatar avatar-${size}`} aria-label={`Avatar de ${name}`}>
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" /> : initial}
    </span>
  );
}
