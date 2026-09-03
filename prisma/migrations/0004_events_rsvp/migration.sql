ALTER TABLE "Event"
  ADD CONSTRAINT "Event_date_range_check"
  CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
  ADD CONSTRAINT "Event_participant_limit_check"
  CHECK ("participantLimit" IS NULL OR "participantLimit" > 0),
  ADD CONSTRAINT "Event_estimated_cost_check"
  CHECK ("estimatedCost" IS NULL OR "estimatedCost" >= 0),
  ADD CONSTRAINT "Event_currency_check"
  CHECK ("currency" ~ '^[A-Z]{3}$');

CREATE INDEX "Event_communityId_status_startsAt_idx"
  ON "Event"("communityId", "status", "startsAt");
