import Link from "next/link";

export function GoogleSignInButton({
  next = "/lobby",
}: {
  next?: string;
}) {
  return (
    <Link className="button" href={`/api/auth/google?next=${encodeURIComponent(next)}`}>
      Continue with Google
    </Link>
  );
}
