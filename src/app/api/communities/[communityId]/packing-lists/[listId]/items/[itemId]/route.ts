import { packingItemSchema, packingItemActionSchema } from "@/lib/validation/packing-list";
import { packingListBody, packingListRoute } from "@/server/http/packing-list-route";
import { changePackingItem } from "@/server/services/packing-list-service";

type Context = { params: Promise<{ communityId: string; listId: string; itemId: string }> };

export function PUT(request: Request, context: Context) {
  return packingListRoute(request, context, async (userId, { communityId, listId, itemId }) => ({
    item: await changePackingItem(userId, communityId, listId, itemId, {
      type: "edit",
      input: await packingListBody(request, packingItemSchema),
    }),
  }));
}

export function PATCH(request: Request, context: Context) {
  return packingListRoute(request, context, async (userId, { communityId, listId, itemId }) => ({
    item: await changePackingItem(userId, communityId, listId, itemId, {
      type: "action",
      input: await packingListBody(request, packingItemActionSchema),
    }),
  }));
}

export function DELETE(request: Request, context: Context) {
  return packingListRoute(request, context, async (userId, { communityId, listId, itemId }) => {
    await changePackingItem(userId, communityId, listId, itemId, { type: "delete" });
    return { success: true };
  });
}
