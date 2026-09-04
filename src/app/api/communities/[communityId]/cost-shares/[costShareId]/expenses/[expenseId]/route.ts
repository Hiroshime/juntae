import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { costShareExpenseSchema } from "@/lib/validation/cost-share";
import { requireAuthenticatedUser } from "@/server/authorization";
import {
  deleteCostShareExpense,
  updateCostShareExpense,
} from "@/server/services/cost-share-service";

type Context = {
  params: Promise<{ communityId: string; costShareId: string; expenseId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, costShareId, expenseId } = await params;
    const parsed = costShareExpenseSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({
      expense: await updateCostShareExpense(
        user.id,
        communityId,
        costShareId,
        expenseId,
        parsed.data,
      ),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, costShareId, expenseId } = await params;
    await deleteCostShareExpense(user.id, communityId, costShareId, expenseId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
