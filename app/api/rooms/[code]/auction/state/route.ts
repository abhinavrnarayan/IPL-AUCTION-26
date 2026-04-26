import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { getAuctionLiveSnapshot } from "@/lib/server/auction-live";
import { requireRoomMember } from "@/lib/server/room";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomMember(code, authUser.id);
    const snapshot = await getAuctionLiveSnapshot(room.id, room.timerSeconds);

    return NextResponse.json(snapshot ?? { serverTime: Date.now() });
  } catch (error) {
    return handleRouteError(error);
  }
}
