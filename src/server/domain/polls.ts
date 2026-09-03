import type { PollStatus, PollType } from "@prisma/client";

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
