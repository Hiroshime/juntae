ALTER TABLE "ScheduleRule"
  ADD CONSTRAINT "ScheduleRule_date_range_check"
  CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
  ADD CONSTRAINT "ScheduleRule_shape_check"
  CHECK (
    (
      "ruleType" = 'WEEKLY'
      AND "weeklyPattern" IS NOT NULL
      AND "anchorDate" IS NULL
      AND "workDays" IS NULL
      AND "restDays" IS NULL
    )
    OR
    (
      "ruleType" = 'CYCLE'
      AND "weeklyPattern" IS NULL
      AND "anchorDate" IS NOT NULL
      AND "workDays" > 0
      AND "restDays" > 0
    )
  );

ALTER TABLE "AvailabilityOverride"
  ADD CONSTRAINT "AvailabilityOverride_date_range_check"
  CHECK ("endAt" > "startAt");

CREATE INDEX "ScheduleRule_communityId_userId_status_startDate_idx"
  ON "ScheduleRule"("communityId", "userId", "status", "startDate");

CREATE INDEX "AvailabilityOverride_communityId_userId_startAt_endAt_idx"
  ON "AvailabilityOverride"("communityId", "userId", "startAt", "endAt");
