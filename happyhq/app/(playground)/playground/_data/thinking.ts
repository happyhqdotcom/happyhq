import type { ThinkingBlock } from '@/lib/chat/types'

// Single block — concise reasoning about a recipe question
export const THINKING_SINGLE_BLOCK: ThinkingBlock[] = [
  {
    text: 'The user is asking about apple pie recipe — this is a personal, refined process passed down from their grandmother. I should ask about the key decision points: crust type, apple variety, and any documentation they have. The "non-obvious steps" comment suggests there are techniques that matter a lot, so I need to dig into those.',
  },
]

// Multiple blocks — two distinct reasoning steps
export const THINKING_MULTIPLE_BLOCKS: ThinkingBlock[] = [
  {
    text: 'The user wants to teach me their apple pie recipe — this is a personal, refined process passed down from their grandmother. I should ask about the key decision points: crust type, apple variety, and any documentation they have. The "non-obvious steps" comment suggests there are techniques that matter a lot, so I need to dig into those.',
  },
  {
    text: 'Looking at the recipe notes they shared, the maceration step is critical — 45 minutes with sugar draws out moisture and concentrates flavor. The ratio of Granny Smith to Honeycrisp matters too: 60/40 gives the right balance of tart structure and sweet juiciness. I should highlight these as the make-or-break decisions.',
  },
]

// Long block — extended multi-step reasoning
export const THINKING_LONG_BLOCK: ThinkingBlock[] = [
  {
    text: "Let me work through this apple pie recipe systematically. The user's grandmother used a double-crust method with an all-butter pastry, which means the dough needs to stay cold throughout — any warmth and the butter melts, killing the flaky layers. I should recommend chilling the flour and using ice water.\n\nFor the filling, maceration is the key technique: tossing the sliced apples with sugar and letting them sit for 45 minutes draws out excess moisture. Without this step, the pie ends up with a soggy bottom and a gap between the filling and the top crust as the apples shrink during baking.\n\nThe apple blend matters enormously. Granny Smith provides tartness and holds its shape, but used alone it's one-dimensional. Mixing in Honeycrisp adds sweetness and a more complex flavor. The 60/40 ratio the user mentioned lines up with what I know about achieving good balance.\n\nThickener choice is another decision point — cornstarch gives a cleaner set than flour, but tapioca starch is even better for fruit pies because it stays clear and doesn't break down during the long bake time. I should mention all three options with trade-offs.\n\nThe baking temperature strategy is a two-phase approach: start at 425\u00B0F for 20 minutes to set the crust and get initial browning, then drop to 375\u00B0F for another 35-40 minutes to cook the filling through without burning the edges. An egg wash before baking gives that deep golden color.\n\nFinally, the cooling period is non-negotiable — the pie needs at least 2 hours at room temperature for the filling to set. Cutting into it early means runny filling that won't hold its shape on the plate. I should emphasize this since it's the most commonly skipped step.",
  },
]
