ALTER TABLE "Poll" ADD COLUMN "eventId" UUID;

CREATE INDEX "Poll_eventId_idx" ON "Poll"("eventId");

ALTER TABLE "Poll" ADD CONSTRAINT "Poll_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
