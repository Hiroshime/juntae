ALTER TABLE "Event"
  ADD COLUMN "allowMaybe" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowPartialAttendance" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "EventRsvp"
  ADD COLUMN "attendingSpecificDays" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EventRsvpDay" (
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "date" DATE NOT NULL,
  CONSTRAINT "EventRsvpDay_pkey" PRIMARY KEY ("eventId", "userId", "date")
);

CREATE INDEX "EventRsvpDay_eventId_date_idx" ON "EventRsvpDay"("eventId", "date");

ALTER TABLE "EventRsvpDay"
  ADD CONSTRAINT "EventRsvpDay_eventId_userId_fkey"
  FOREIGN KEY ("eventId", "userId") REFERENCES "EventRsvp"("eventId", "userId")
  ON DELETE CASCADE ON UPDATE CASCADE;
