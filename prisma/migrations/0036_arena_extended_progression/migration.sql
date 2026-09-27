ALTER TABLE "ArenaShelter"
DROP CONSTRAINT "ArenaShelter_progress_check";

ALTER TABLE "ArenaShelter"
ADD CONSTRAINT "ArenaShelter_progress_check" CHECK (
    "level" BETWEEN 1 AND 10
    AND "points" >= 0
);
