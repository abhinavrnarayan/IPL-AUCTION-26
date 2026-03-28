import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { joinRoomSchema } from "@/lib/domain/schemas";
import { readJson, handleRouteError } from "@/lib/server/api";
import { requireApiUser, syncUserProfileFromAuthUser } from "@/lib/server/auth";
import { findRoomByCode, getRoomMember } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const authUser = await requireApiUser();
    await syncUserProfileFromAuthUser(authUser);
    const input = await readJson(request, joinRoomSchema);
    const room = await findRoomByCode(input.code);
    const existingMember = await getRoomMember(room.id, authUser.id);

    if (!existingMember) {
      const admin = getSupabaseAdminClient();
      const { error } = await admin.from("room_members").insert({
        room_id: room.id,
        user_id: authUser.id,
        is_admin: false,
        is_player: true,
      });

      if (error) {
        throw new AppError(error.message, 500, "ROOM_JOIN_FAILED");
      }
    }

    revalidatePath("/lobby");
    revalidatePath(`/room/${room.code}`);

    return NextResponse.json({
      room: {
        id: room.id,
        code: room.code,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
