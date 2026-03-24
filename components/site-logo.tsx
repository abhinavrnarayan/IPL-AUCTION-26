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
  return (
    <span
      className={`site-logo${className ? ` ${className}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        // inherit font styles from parent .brand
      }}
    >
      <Image
        alt="SFL logo"
        height={size}
        src="/images/sfl.png"
        style={{ objectFit: "contain", flexShrink: 0 }}
        width={size}
      />
      <span>SFL{suffix ? ` ${suffix}` : ""}</span>
    </span>
  );
}
