import { packingListSchema } from "@/lib/validation/packing-list";
import { packingListBody, packingListRoute } from "@/server/http/packing-list-route";
import { getPackingList, updatePackingList } from "@/server/services/packing-list-service";

type Context = { params: Promise<{ communityId: string; listId: string }> };

export function GET(request: Request, context: Context) {
  return packingListRoute(request, context, async (userId, { communityId, listId }) => ({
    list: await getPackingList(userId, communityId, listId),
  }));
}

export function PATCH(request: Request, context: Context) {
  return packingListRoute(request, context, async (userId, { communityId, listId }) => ({
    list: await updatePackingList(
      userId,
      communityId,
      listId,
      await packingListBody(request, packingListSchema),
    ),
  }));
}
