export const randomizerPresetTypes = [
  "TEAMS",
  "GROUPS",
  "CARS",
  "ASSIGN_ITEMS",
  "PICK_PEOPLE",
  "PICK_ITEM",
  "RANDOM_ORDER",
  "PAIRS",
] as const;

export type RandomizerPresetType = (typeof randomizerPresetTypes)[number];

export type RandomizerEntry = {
  id: string;
  label: string;
  metadata?: Record<string, unknown>;
};

export type RandomizerConstraints = {
  together?: string[][];
  separate?: Array<[string, string]>;
  fixedGroups?: Array<{ participantId: string; groupIndex: number }>;
  captainIds?: string[];
  excludedAssignments?: Array<{ participantId: string; itemId: string }>;
};

export type RandomizerRequest = {
  presetType: RandomizerPresetType;
  participants: RandomizerEntry[];
  configuration: {
    groupCount?: number;
    maxGroupSize?: number;
    groupNames?: string[];
    drivers?: Array<RandomizerEntry & { capacity: number }>;
    items?: RandomizerEntry[];
    count?: number;
    allowRepeatedItems?: boolean;
    oddMode?: "TRIO" | "UNPAIRED";
  };
  constraints?: RandomizerConstraints;
};

export type RandomizerResult =
  | {
      kind: "GROUPS";
      groups: Array<{
        id: string;
        label: string;
        members: RandomizerEntry[];
        captainId?: string;
      }>;
      unassigned?: RandomizerEntry[];
    }
  | {
      kind: "ASSIGNMENTS";
      assignments: Array<{ participant: RandomizerEntry; item: RandomizerEntry }>;
    }
  | { kind: "SELECTION"; selected: RandomizerEntry[] }
  | { kind: "ORDER"; ordered: RandomizerEntry[] };
