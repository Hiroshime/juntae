import { packingListStatusSchema } from "@/lib/validation/packing-list";
import { packingListBody, packingListRoute } from "@/server/http/packing-list-route";
import { setPackingListClosed } from "@/server/services/packing-list-service";

type Context = { params: Promise<{ communityId: string; listId: string }> };

export function PUT(request: Request, context: Context) {
  return packingListRoute(request, context, async (userId, { communityId, listId }) => ({
    list: await setPackingListClosed(
      userId,
      communityId,
      listId,
      (await packingListBody(request, packingListStatusSchema)).closed,
    ),
  }));
}
