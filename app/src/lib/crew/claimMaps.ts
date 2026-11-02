import type { CrewType } from './dossier'

// Positions, connections and effects transcribed from Blades ’68 crew sheets v6,
// Letter Color, pages 1–6 (Deep Cuts excluded). Source PDF SHA-256:
// cba6b2eb812e26c66b51e0958056e886aa544305fa09e5ecd2665a653e195875.
// Numbers are the existing catalog claim ordinals; 0 is the crew’s base.
// Dealer connections are directed. Utopians have Circle rows, without paths.
interface ClaimMapDefinition {
  rows: number[][]
  connections: number[][]
  special: number[]
  effects: Record<string, string>
  rowLabels?: string[]
}
export interface ClaimDefinition { id: string; name: string; circle?: number }

export const claimMaps: Record<CrewType, ClaimMapDefinition> = {
  "Dealers": {
    "rows": [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
      [16, 17, 18, 19, 20]
    ],
    "connections": [
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [7, 8],
      [8, 9],
      [9, 10],
      [11, 12],
      [12, 13],
      [13, 14],
      [14, 15],
      [16, 17],
      [17, 18],
      [18, 19],
      [19, 20],
      [2, 7],
      [12, 7]
    ],
    "special": [13, 15],
    "effects": {
      "1": "Once per personal business, take 1 Heat to gain 1 unit",
      "2": "Once per personal business, take 1 Heat to gain 1 unit",
      "3": "Once per personal business, take 1 Heat to gain 2 units",
      "4": "Once per personal business, take 1 Heat to gain 2 units",
      "5": "Once per personal business, take 1 Heat to gain 3 units",
      "6": "All turf generates +1 stack when moving units",
      "7": "All turf generates +1 stack when moving units",
      "8": "+1d to Consort and Sway on-site, +2 stacks for social intrigue",
      "9": "All turf generates +1 stack when moving units",
      "10": "All turf generates +1 stack when moving units",
      "11": "+1d engagement roll for social plans, +2 stacks for bulk sale or supply",
      "12": "Take -3 Heat from gaining/moving units, every personal business",
      "13": "+2d engagement for Monopoly score",
      "14": "Take -3 Heat from gaining/moving units, every personal business",
      "15": "Tier 5 target, all Turf can move 2 units per downtime for the same Heat",
      "16": "1 unit can be moved for 1 stack in personal business (take 1 Heat)",
      "17": "1 unit can be moved for 1 stack in personal business (take 1 Heat)",
      "18": "1 unit can be moved for 1 stack in personal business (take 1 Heat)",
      "19": "1 unit can be moved for 1 stack in personal business (take 1 Heat)",
      "20": "1 unit can be moved for 1 stack in personal business (take 1 Heat)"
    },
    "rowLabels": [
      "Supply",
      "Demand",
      "Competitive advantages",
      "Distribution"
    ]
  },
  "Hit Squad": {
    "rows": [
      [1, 5, 9, 12, 16],
      [2, 6, 10, 13, 17],
      [3, 7, 11, 14, 18],
      [4, 8, 0, 15, 19]
    ],
    "connections": [
      [1, 5],
      [1, 2],
      [5, 9],
      [5, 6],
      [9, 12],
      [12, 16],
      [16, 17],
      [2, 6],
      [2, 3],
      [6, 10],
      [10, 13],
      [10, 11],
      [13, 17],
      [17, 18],
      [3, 7],
      [3, 4],
      [7, 11],
      [11, 14],
      [11, 0],
      [14, 18],
      [14, 15],
      [18, 19],
      [4, 8],
      [8, 0],
      [0, 15]
    ],
    "special": [3, 9, 10, 12, 19],
    "effects": {
      "1": "+1 Rep per score",
      "5": "+1d engagement for stealth approaches",
      "9": "Tier 5 target, 15 Rep, 10 stacks",
      "12": "Legendary Target includes second hit, for +10 bonus stacks",
      "16": "+1d engagement for deception and social approaches",
      "2": "(Tier roll) - Heat = stacks in downtime",
      "6": "+1 scale for your Infiltrator cohorts",
      "10": "+2d engagement for Legendary Target score",
      "13": "-2 Heat per score",
      "17": "Body disposal, +1d to reduce Heat after killing",
      "3": "Tier 4 target, +5 bonus Rep",
      "7": "(Tier roll) - Heat = stacks in downtime",
      "11": "+2 stacks from high-class clients",
      "14": "+1d to healing rolls",
      "18": "+1d gather info for scores",
      "4": "+2 stacks from lower-class clients",
      "8": "Expand hunting grounds and add new preferred operation",
      "15": "Expand hunting grounds and add new preferred operation",
      "19": "3 free flashbacks during Legendary Target score"
    }
  },
  "Militants": {
    "rows": [
      [1, 5, 9, 12, 16],
      [2, 6, 10, 13, 17],
      [3, 7, 11, 14, 18],
      [4, 8, 0, 15, 19]
    ],
    "connections": [
      [1, 5],
      [1, 2],
      [5, 9],
      [5, 6],
      [9, 12],
      [12, 16],
      [12, 13],
      [16, 17],
      [2, 6],
      [2, 3],
      [6, 10],
      [6, 7],
      [10, 13],
      [10, 11],
      [13, 14],
      [17, 18],
      [3, 4],
      [7, 11],
      [11, 14],
      [11, 0],
      [14, 18],
      [18, 19],
      [4, 8],
      [8, 0],
      [0, 15],
      [15, 19]
    ],
    "special": [2, 7, 9, 10, 12],
    "effects": {
      "1": "Stockpiles give you +1d to Acquire Asset rolls",
      "5": "+1d engagement for stealth approaches",
      "9": "Tier 5 target, target drops 2 Tiers",
      "12": "Critical Strike score includes +10 bonus stacks",
      "16": "+1 scale for your Muscle cohorts",
      "2": "Tier 4 target, creates new Tier 2 faction (+2 status)",
      "6": "Add new preferred operation",
      "10": "+2d engagement for Critical Strike score",
      "13": "Add new preferred operation",
      "17": "+1d to Command and Sway on-site",
      "3": "+1d to gather info for scores",
      "7": "New faction from Catalyst Action score will be +3 status",
      "11": "+2 stacks for battle or demonstration",
      "14": "+1d to healing rolls",
      "18": "(Tier roll) - Heat = stacks in downtime",
      "4": "+2 stacks for sabotage or assassination",
      "8": "Add new preferred operation",
      "15": "Add new preferred operation",
      "19": "+1d to Consort and Sway on-site"
    }
  },
  "Racers": {
    "rows": [
      [1, 5, 9, 12, 16],
      [2, 6, 10, 13, 17],
      [3, 7, 11, 14, 18],
      [4, 8, 0, 15, 19]
    ],
    "connections": [
      [1, 5],
      [1, 2],
      [5, 9],
      [9, 12],
      [12, 16],
      [16, 17],
      [2, 6],
      [2, 3],
      [6, 10],
      [6, 7],
      [10, 13],
      [10, 11],
      [13, 17],
      [17, 18],
      [3, 4],
      [7, 11],
      [7, 8],
      [11, 0],
      [14, 18],
      [14, 15],
      [18, 19],
      [4, 8],
      [8, 0],
      [0, 15],
      [15, 19]
    ],
    "special": [3, 5, 9, 12, 19],
    "effects": {
      "1": "Safe passage out of the Bubble",
      "5": "+2d engagement for Deathlands Race score",
      "9": "Tier 4 opponents, 10 Rep, 15 stacks",
      "12": "Take out a target during Deathlands Race score for +10 bonus stacks",
      "16": "(Tier roll) - Heat = stacks in downtime",
      "2": "+1d engagement for speed approaches",
      "6": "Expand local circuit and add new preferred operation",
      "10": "Expand local circuit and add new preferred operation",
      "13": "(Tier roll) - Heat = stacks in downtime",
      "17": "Stockpiles give you +1d to Acquire Asset rolls",
      "3": "Tier 3 opponents, 15 stacks",
      "7": "+1d to Consort and Sway on-site",
      "11": "Expand local circuit and add new preferred operation",
      "14": "+1d gather info for scores",
      "18": "-2 Heat per score",
      "4": "Expand local circuit and add new preferred operation",
      "8": "+2 stacks for smuggling or hijacking",
      "15": "Your cohorts have their own vehicles",
      "19": "+5 bonus stacks for Deathlands Race score"
    }
  },
  "Shadows": {
    "rows": [
      [1, 5, 9, 12, 16],
      [2, 6, 10, 13, 17],
      [3, 7, 11, 14, 18],
      [4, 8, 0, 15, 19]
    ],
    "connections": [
      [1, 5],
      [1, 2],
      [5, 9],
      [5, 6],
      [9, 12],
      [12, 16],
      [12, 13],
      [16, 17],
      [2, 3],
      [6, 10],
      [6, 7],
      [10, 13],
      [10, 11],
      [13, 17],
      [17, 18],
      [3, 7],
      [3, 4],
      [7, 11],
      [11, 14],
      [11, 0],
      [14, 18],
      [18, 19],
      [4, 8],
      [8, 0],
      [0, 15],
      [15, 19]
    ],
    "special": [3, 6, 9, 12, 13],
    "effects": {
      "1": "+1d engagement for deception and social plans",
      "5": "Expand hunting grounds and add new preferred operation",
      "9": "Tier 5 target, 30 stacks, complete any clock",
      "12": "Target for Checkmate counts as -1 Tier for that score",
      "16": "+1d engagement for stealth plans",
      "2": "-2 Heat per score",
      "6": "Checkmate score earns +10 bonus stacks",
      "10": "+1d to Acquire Asset rolls",
      "13": "+2d engagement for Checkmate score",
      "17": "+1d to Consort and Sway on-site",
      "3": "Tier 4 target, 15 stacks, +4 ticks on any clock",
      "7": "(Tier roll) - Heat = stacks in downtime",
      "11": "+1d gather info for scores",
      "14": "Expand hunting grounds and add new preferred operation",
      "18": "+1d to healing rolls",
      "4": "Expand hunting grounds and add new preferred operation",
      "8": "+2 stacks for heists or subterfuge",
      "15": "+2 stacks for surveillance or sabotage",
      "19": "(Tier roll) - Heat = stacks in downtime"
    }
  },
  "Utopians": {
    "rows": [
      [12, 1, 0, 16, 8],
      [13, 2, 5, 17, 9],
      [14, 3, 6, 18, 10],
      [15, 4, 7, 19, 11]
    ],
    "connections": [],
    "special": [4, 6, 7, 15, 19],
    "effects": {
      "12": "(Tier roll) - Heat = stacks in downtime",
      "1": "",
      "16": "",
      "8": "+1 scale for your Egghead cohorts",
      "13": "+2 stacks for paranormal operations",
      "2": "",
      "5": "+1d to Command and Sway on-site",
      "17": "",
      "9": "+1d to healing rolls",
      "14": "+1d to Attune on-site",
      "3": "+1d engagement for paranormal approaches",
      "6": "Tier 4 target, creates new major anomaly",
      "18": "+1d to Consort w/ resonance entities on-site",
      "10": "Safe passage out of the Bubble",
      "15": "+2d engagement for Reality Tear score",
      "4": "Successful Reality Tear score includes +4 Rep",
      "7": "Tier 5 target, creates new mega anomaly",
      "19": "Reality Tear score includes +6 bonus stacks",
      "11": "NPC can take the fall to remove 3 Wanted Levels"
    },
    "rowLabels": [
      "First Circle",
      "Second Circle",
      "Third Circle",
      "Final Circle"
    ]
  }
}
