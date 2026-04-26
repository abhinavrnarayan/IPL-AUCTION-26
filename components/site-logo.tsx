import Image from "next/image";

interface SiteLogoProps {
  /** Extra text shown after the logo+SFL, e.g. "Auction Platform" or "Lobby" */
  suffix?: string;
  /** Size of the logo image in px (default 28) */
  size?: number;
  /** Additional className for the wrapper span */
  className?: string;
}

/**
 * SFL brand mark — logo image + "SFL" text, with an optional suffix.
 * Use inside any .brand div or heading.
 */
export function SiteLogo({ suffix, size = 28, className }: SiteLogoProps) {
  const framePadding = Math.round(size * 0.12);

  return (
    <span
      className={`site-logo${className ? ` ${className}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.55rem",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: framePadding,
          borderRadius: "10px",
          background:
            "linear-gradient(180deg, rgba(252,211,77,0.18) 0%, rgba(201,24,43,0.12) 100%)",
          border: "1px solid",
          borderImage:
            "linear-gradient(180deg, #fcd34d 0%, #d4a24c 55%, #8b6914 100%) 1",
          boxShadow:
            "0 0 12px rgba(252, 211, 77, 0.18), inset 0 1px 0 rgba(255,255,255,0.1)",
          flexShrink: 0,
        }}
      >
        <Image
          alt="SFL logo"
          height={size}
          src="/images/sfl.png"
          style={{ objectFit: "contain", display: "block" }}
          width={size}
        />
      </span>
      <span>SFL{suffix ? ` ${suffix}` : ""}</span>
    </span>
  );
}
