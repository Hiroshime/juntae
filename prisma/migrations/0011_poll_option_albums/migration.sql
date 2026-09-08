CREATE TABLE "PollOptionImage" (
  "id" UUID NOT NULL,
  "optionId" UUID NOT NULL,
  "data" BYTEA NOT NULL,
  "contentType" VARCHAR(32) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PollOptionImage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PollOptionImage_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 6291456),
  CONSTRAINT "PollOptionImage_sort_order_check" CHECK ("sortOrder" >= 0),
  CONSTRAINT "PollOptionImage_content_type_check"
    CHECK ("contentType" IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'))
);

CREATE INDEX "PollOptionImage_optionId_sortOrder_idx"
  ON "PollOptionImage"("optionId", "sortOrder");

ALTER TABLE "PollOptionImage"
  ADD CONSTRAINT "PollOptionImage_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "PollOption"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
