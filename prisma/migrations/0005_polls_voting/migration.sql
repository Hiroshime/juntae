ALTER TABLE "Poll"
  ADD CONSTRAINT "Poll_closes_after_creation_check"
  CHECK ("closesAt" IS NULL OR "closesAt" > "createdAt");

ALTER TABLE "PollOption"
  ADD CONSTRAINT "PollOption_sort_order_check"
  CHECK ("sortOrder" >= 0);

CREATE INDEX "Poll_communityId_status_closesAt_idx"
  ON "Poll"("communityId", "status", "closesAt");

CREATE INDEX "PollVote_pollId_optionId_idx"
  ON "PollVote"("pollId", "optionId");
