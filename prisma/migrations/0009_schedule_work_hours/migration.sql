ALTER TABLE "ScheduleRule"
ADD COLUMN "workStartMinute" INTEGER,
ADD COLUMN "workEndMinute" INTEGER;

ALTER TABLE "ScheduleRule"
ADD CONSTRAINT "ScheduleRule_work_hours_pair_check"
CHECK (("workStartMinute" IS NULL) = ("workEndMinute" IS NULL)),
ADD CONSTRAINT "ScheduleRule_work_start_minute_check"
CHECK ("workStartMinute" IS NULL OR "workStartMinute" BETWEEN 0 AND 1439),
ADD CONSTRAINT "ScheduleRule_work_end_minute_check"
CHECK ("workEndMinute" IS NULL OR "workEndMinute" BETWEEN 0 AND 1439),
ADD CONSTRAINT "ScheduleRule_work_hours_different_check"
CHECK ("workStartMinute" IS NULL OR "workStartMinute" <> "workEndMinute");

COMMENT ON COLUMN "ScheduleRule"."workStartMinute" IS
'Minute of the local civil day when work starts; null preserves legacy all-day work rules.';
COMMENT ON COLUMN "ScheduleRule"."workEndMinute" IS
'Minute of the local civil day when work ends; a value lower than start denotes an overnight shift.';
