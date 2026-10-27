import { z } from "zod";
import { packingListSchema } from "@/lib/validation/packing-list";
import { packingListBody, packingListRoute } from "@/server/http/packing-list-route";
import { createPackingList, listPackingLists } from "@/server/services/packing-list-service";
import { AppError } from "@/server/errors";

type Context = { params: Promise<{ communityId: string }> };

export function GET(request: Request, context: Context) {
  return packingListRoute(request, context, async (userId, { communityId }) => {
    const query = new URL(request.url).searchParams;
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).max(100000),
        eventId: z.string().uuid().optional(),
      })
      .safeParse({ page: query.get("page") || 1, eventId: query.get("event") || undefined });
    if (!parsed.success) throw new AppError("Filtro inválido.");
    return listPackingLists(userId, communityId, parsed.data.page, parsed.data.eventId);
  });
}

export function POST(request: Request, context: Context) {
  return packingListRoute(
    request,
    context,
    async (userId, { communityId }) => ({
      list: await createPackingList(
        userId,
        communityId,
        await packingListBody(request, packingListSchema),
      ),
    }),
    201,
  );
}
