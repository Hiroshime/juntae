import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isTransactionConflict } from "@/lib/db/transaction-conflict";

describe("conflitos de transação", () => {
  const error = (code: string, sqlCode?: string) =>
    new Prisma.PrismaClientKnownRequestError("test", {
      code,
      clientVersion: "6",
      ...(sqlCode ? { meta: { code: sqlCode } } : {}),
    });
  it("reconhece serialização e deadlock inclusive em consultas SQL", () => {
    expect(isTransactionConflict(error("P2034"))).toBe(true);
    expect(isTransactionConflict(error("P2010", "40001"))).toBe(true);
    expect(isTransactionConflict(error("P2010", "40P01"))).toBe(true);
  });
  it("não encobre falhas de integridade ou erros desconhecidos", () => {
    expect(isTransactionConflict(error("P2010", "23503"))).toBe(false);
    expect(isTransactionConflict(error("P2002"))).toBe(false);
    expect(isTransactionConflict(new Error("falha"))).toBe(false);
  });
});
