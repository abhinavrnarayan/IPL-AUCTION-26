import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { buildDefaultPlayerPoolRows } from "@/lib/default-player-pool";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser, syncUserProfileFromAuthUser } from "@/lib/server/auth";
import { insertPlayersIntoRoom } from "@/lib/server/player-import";
import { requireRoomAdmin } from "@/lib/server/room";

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    await syncUserProfileFromAuthUser(authUser);
    const { room } = await requireRoomAdmin(code, authUser.id);
    const result = await insertPlayersIntoRoom(
      room,
      buildDefaultPlayerPoolRows(room.bidIncrement),
      { requireEmpty: true },
    );

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
