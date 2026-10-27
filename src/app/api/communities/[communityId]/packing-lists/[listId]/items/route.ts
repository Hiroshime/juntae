import { packingItemSchema } from "@/lib/validation/packing-list";
import { packingListBody, packingListRoute } from "@/server/http/packing-list-route";
import { createPackingItem } from "@/server/services/packing-list-service";

type Context = { params: Promise<{ communityId: string; listId: string }> };

export function POST(request: Request, context: Context) {
  return packingListRoute(
    request,
    context,
    async (userId, { communityId, listId }) => ({
      item: await createPackingItem(
        userId,
        communityId,
        listId,
        await packingListBody(request, packingItemSchema),
      ),
    }),
    201,
  );
}
