import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

import { asAppError } from "@/lib/domain/errors";

export async function readJson<T>(request: Request, schema: ZodSchema<T>) {
  const body = await request.json();
  return schema.parse(body);
}

export function handleRouteError(error: unknown) {
  const appError = asAppError(error);

  return NextResponse.json(
    {
      error: appError.message,
      code: appError.code,
    },
    {
      status: appError.status,
    },
  );
}
