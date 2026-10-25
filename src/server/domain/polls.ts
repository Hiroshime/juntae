import type { PollStatus, PollType } from "@prisma/client";

export const POLL_REOPEN_WINDOW_DAYS = 15;
export const POLL_REOPEN_WINDOW_MS = POLL_REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1_000;

type ReopenablePoll = {
  status: PollStatus;
  closesAt: Date | null;
  closedAt: Date | null;
  updatedAt: Date;
};

export function effectivePollStatus(
  status: PollStatus,
  closesAt: Date | null,
  now = new Date(),
): PollStatus {
  return status === "CLOSED" || (closesAt != null && closesAt <= now) ? "CLOSED" : "OPEN";
}

export function assertPollAcceptsVotes(
  poll: { status: PollStatus; closesAt: Date | null },
  now = new Date(),
) {
  if (effectivePollStatus(poll.status, poll.closesAt, now) === "CLOSED") {
    throw new Error("POLL_CLOSED");
  }
}

export function pollClosureTime(poll: ReopenablePoll, now = new Date()) {
  if (effectivePollStatus(poll.status, poll.closesAt, now) === "OPEN") return null;
  if (poll.status === "CLOSED") return poll.closedAt ?? poll.updatedAt;
  return poll.closesAt;
}

export function pollReopenState(poll: ReopenablePoll, now = new Date()) {
  const closedAt = pollClosureTime(poll, now);
  const reopenUntil = closedAt ? new Date(closedAt.getTime() + POLL_REOPEN_WINDOW_MS) : null;
  return {
    closedAt,
    reopenUntil,
    canReopen: reopenUntil != null && reopenUntil >= now,
  };
}

export function calculatePollReopenDeadline(durationDays: number, now = new Date()) {
  if (
    !Number.isInteger(durationDays) ||
    durationDays < 1 ||
    durationDays > POLL_REOPEN_WINDOW_DAYS
  ) {
    throw new Error("INVALID_POLL_REOPEN_DURATION");
  }
  return new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1_000);
}

export function validateVoteSelection(type: PollType, optionIds: string[]) {
  const uniqueIds = new Set(optionIds);
  if (!optionIds.length || uniqueIds.size !== optionIds.length) {
    throw new Error("INVALID_VOTE_SELECTION");
  }
  if (type === "SINGLE_CHOICE" && optionIds.length !== 1) {
    throw new Error("SINGLE_CHOICE_REQUIRES_ONE");
  }
}

export function summarizePollResults(
  options: Array<{ id: string; votes: Array<{ userId: string }> }>,
) {
  const voters = new Set(options.flatMap((option) => option.votes.map((vote) => vote.userId)));
  const totalVoters = voters.size;
  return {
    totalVoters,
    options: options.map((option) => ({
      optionId: option.id,
      voteCount: option.votes.length,
      percentage: totalVoters ? Math.round((option.votes.length / totalVoters) * 100) : 0,
    })),
  };
}
