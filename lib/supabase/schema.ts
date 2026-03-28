import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type SupabaseSchemaStatus = {
  ready: boolean;
  message?: string;
  missingTable?: string;
};

function extractMissingTable(message: string) {
  const cacheMatch = message.match(/table 'public\.([^']+)'/i);
  if (cacheMatch?.[1]) {
    return cacheMatch[1];
  }

  const relationMatch = message.match(/relation ["']?public\.([^"'\s]+)["']?/i);
  if (relationMatch?.[1]) {
    return relationMatch[1];
  }

  return undefined;
}

export function isMissingSupabaseTableError(message?: string | null) {
  const normalizedMessage = message?.toLowerCase() ?? "";

  return (
    normalizedMessage.includes("schema cache") ||
    normalizedMessage.includes("could not find the table 'public.") ||
    normalizedMessage.includes('relation "public.') ||
    normalizedMessage.includes("relation 'public.")
  );
}

export async function getSupabaseSchemaStatus(): Promise<SupabaseSchemaStatus> {
  const admin = getSupabaseAdminClient();

  const checks = await Promise.all([
    admin.from("users").select("id").limit(1),
    admin.from("rooms").select("id").limit(1),
    admin.from("room_members").select("room_id").limit(1),
  ]);

  for (const check of checks) {
    if (check.error) {
      if (isMissingSupabaseTableError(check.error.message)) {
        return {
          ready: false,
          message: check.error.message,
          missingTable: extractMissingTable(check.error.message),
        };
      }

      throw check.error;
    }
  }

  return { ready: true };
}
