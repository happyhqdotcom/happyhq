import type { ChatMessage } from '@/lib/chat/types'

// ---------------------------------------------------------------------------
// Full learning session — user teaching Q their apple pie recipe
// Slimmed from the kitchen-sink 12-message set: dropped web search (ks-8),
// writing preview with subagent (ks-9), and writing preview with file (ks-10)
// since those features are tested individually in their own registrations.
// ---------------------------------------------------------------------------

export const CONVERSATION_LEARNING_SESSION: ChatMessage[] = [
  // 1. User: plain text
  {
    id: 'conv-ls-1',
    role: 'user',
    content:
      "I want to teach you how I make apple pie. It's my grandmother's recipe and I've been tweaking it for years — there are some non-obvious steps that really matter.",
    isHistorical: true,
    timestamp: Date.now() - 600_000,
  },

  // 2. Assistant: thinking + markdown response
  {
    id: 'conv-ls-2',
    role: 'assistant',
    content: `I'd love to learn your apple pie process! To make sure I capture it right, a few things would help:

1. **What kind of crust** do you use? (all-butter, butter-lard, store-bought)
2. **Which apple varieties** do you prefer, and do you mix them?
3. Do you have any **written notes or recipe cards** I can look at?

If you can share any past recipes or photos, I'll pull out the structure and key techniques so we can build a solid spec together.`,
    isHistorical: true,
    timestamp: Date.now() - 590_000,
    thinkingBlocks: [
      {
        text: 'The user wants to teach me their apple pie recipe — this is a personal, refined process passed down from their grandmother. I should ask about the key decision points: crust type, apple variety, and any documentation they have. The "non-obvious steps" comment suggests there are techniques that matter a lot, so I need to dig into those.',
      },
    ],
  },

  // 3. User: text + file attachments
  {
    id: 'conv-ls-3',
    role: 'user',
    content:
      "Here's the recipe card my grandmother wrote out, plus a version I typed up with my own notes.",
    files: ['grandmas-apple-pie-original.pdf', 'my-apple-pie-notes.docx'],
    isHistorical: true,
    timestamp: Date.now() - 580_000,
  },

  // 4. Assistant: tool progress (processing samples) + text
  {
    id: 'conv-ls-4',
    role: 'assistant',
    content: `Beautiful — I've gone through both documents. Here's what I'm picking up:

**Core recipe structure:**
- Crust → Filling → Assembly → Bake → Cool

**Key techniques I noticed:**
- You **freeze the butter** and grate it into the flour — that's the flaky crust secret
- The apples get tossed with sugar and **left to macerate for 45 minutes**, then you drain and reduce the liquid into a syrup
- You blind-bake the bottom crust for 15 minutes before filling — no soggy bottoms

**Your grandmother's version vs. yours:**
- She used all Granny Smith; you mix **Honeycrisp + Granny Smith** (2:1 ratio)
- You added a tablespoon of bourbon to the filling (nice touch)
- She rolled thinner crusts; you prefer a thicker, more buttery edge

Want me to ask some follow-up questions to lock in the details?`,
    isHistorical: true,
    timestamp: Date.now() - 570_000,
    toolProgress: [
      { toolName: 'Glob', toolUseId: 'conv-tp-0', elapsedSeconds: 0.3 },
      { toolName: 'Read', toolUseId: 'conv-tp-1', elapsedSeconds: 1.2 },
      { toolName: 'Read', toolUseId: 'conv-tp-2', elapsedSeconds: 0.9 },
      { toolName: 'Grep', toolUseId: 'conv-tp-2b', elapsedSeconds: 0.6 },
      {
        toolName: 'ProcessSample',
        toolUseId: 'conv-tp-3',
        elapsedSeconds: 3.4,
      },
      {
        toolName: 'ProcessSample',
        toolUseId: 'conv-tp-4',
        elapsedSeconds: 2.8,
      },
    ],
    toolCalls: [
      {
        id: 'conv-tp-0',
        name: 'Glob',
        input: { pattern: 'samples/**/*.pdf' },
      },
      {
        id: 'conv-tp-1',
        name: 'Read',
        input: { file_path: '/samples/grandmas-apple-pie-original.pdf' },
      },
      {
        id: 'conv-tp-2',
        name: 'Read',
        input: { file_path: '/samples/my-apple-pie-notes.docx' },
      },
      {
        id: 'conv-tp-2b',
        name: 'Grep',
        input: { pattern: 'blind bake' },
      },
      {
        id: 'conv-tp-3',
        name: 'ProcessSample',
        input: { slug: 'grandmas-apple-pie-original' },
      },
      {
        id: 'conv-tp-4',
        name: 'ProcessSample',
        input: { slug: 'my-apple-pie-notes' },
      },
    ],
  },

  // 5. Assistant: answered question (AskUserQuestion)
  {
    id: 'conv-ls-5',
    role: 'assistant',
    content: '',
    isHistorical: true,
    timestamp: Date.now() - 560_000,
    toolCalls: [
      {
        id: 'conv-ask-1',
        name: 'AskUserQuestion',
        input: {
          questions: [
            {
              question: 'What type of crust do you want as the default?',
              header: 'Crust style',
              options: [
                {
                  label: 'All-butter double crust',
                  description:
                    'Rich and flaky — your current go-to based on your notes',
                },
                {
                  label: 'Butter-lard blend',
                  description:
                    "Your grandmother's original — extra tender and crispy",
                },
                {
                  label: 'Lattice top with full bottom',
                  description:
                    'Same dough, but woven lattice instead of solid top',
                },
              ],
              multiSelect: false,
            },
          ],
        },
        answers: {
          'What type of crust do you want as the default?':
            'All-butter double crust',
        },
      },
    ],
  },

  // 6. Assistant: rich markdown response
  {
    id: 'conv-ls-6',
    role: 'assistant',
    content: `## Apple Pie Spec — All-Butter Double Crust

Perfect. Based on your recipes and preferences, here's what I've captured:

**Crust** (makes top + bottom):
- \`2.5 cups\` all-purpose flour, \`1 cup\` frozen grated butter, \`1 tsp\` salt
- \`6-8 tbsp\` ice water — add one tablespoon at a time
- **Critical:** freeze butter 30 min, grate on box grater, work fast
- Rest dough in fridge **minimum 1 hour** (overnight is better)

**Filling:**
- \`3 lbs\` apples — **2:1 Honeycrisp to Granny Smith**
- \`¾ cup\` sugar, \`1 tbsp\` bourbon, \`2 tsp\` cinnamon, \`¼ tsp\` nutmeg
- \`2 tbsp\` flour + \`1 tbsp\` cornstarch (thickener combo)
- Macerate 45 min → drain → **reduce liquid to syrup** → fold back in

**Bake rules:**
- Blind-bake bottom crust at **425°F for 15 min** with pie weights
- Fill, add top crust, egg wash, coarse sugar
- **425°F for 20 min** → drop to **375°F for 35-40 min**
- Done when juices bubble through vents and crust is deep golden

I've written this up as a spec. Take a look and tell me if I missed anything.`,
    isHistorical: true,
    timestamp: Date.now() - 550_000,
  },

  // 7. User: follow-up request
  {
    id: 'conv-ls-7',
    role: 'user',
    content:
      "This is perfect. Can you make one for Thanksgiving? I need to scale it up — we're doing 4 pies this year and two of them should be the Dutch Apple variation.",
    isHistorical: true,
    timestamp: Date.now() - 520_000,
  },

  // 8. Assistant: proposes a task (CreateTask tool call)
  {
    id: 'conv-ls-8',
    role: 'assistant',
    content:
      "Fun — four pies! I'll scale the recipe, split it into a shopping list and a bake-day timeline. Two classic, two Dutch Apple. Let me set this up as a task:",
    isHistorical: true,
    timestamp: Date.now() - 510_000,
    toolCalls: [
      {
        id: 'conv-task-1',
        name: 'CreateTask',
        input: {
          name: 'thanksgiving-apple-pies',
          textContext:
            'Scale apple pie recipe for Thanksgiving: 4 pies total (2 classic double crust, 2 Dutch Apple crumb top). Generate shopping list and bake-day timeline.',
          files: [],
        },
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Quick exchange — simple back-and-forth, no tool calls or thinking
// ---------------------------------------------------------------------------

export const CONVERSATION_QUICK_EXCHANGE: ChatMessage[] = [
  {
    id: 'conv-qe-1',
    role: 'user',
    content:
      'What temperature should I bake my apple pie at? I keep getting a soggy bottom.',
    isHistorical: true,
    timestamp: Date.now() - 300_000,
  },
  {
    id: 'conv-qe-2',
    role: 'assistant',
    content: `Soggy bottoms are almost always a temperature or moisture issue. Here's the fix:

1. **Blind-bake the bottom crust** at 425°F for 15 minutes with pie weights before adding filling
2. **Two-stage bake:** start at 425°F for 20 minutes (sets the crust fast), then drop to 375°F for 35–40 minutes
3. **Macerate your apples** with sugar for 45 minutes, then drain and reduce the liquid to a syrup before adding it back — this pulls excess moisture out before it hits the crust

The blind bake is the single biggest improvement most people skip.`,
    isHistorical: true,
    timestamp: Date.now() - 295_000,
  },
  {
    id: 'conv-qe-3',
    role: 'user',
    content:
      "I've never tried the maceration step — won't that make the apples too soft before they even go in the oven?",
    isHistorical: true,
    timestamp: Date.now() - 290_000,
  },
  {
    id: 'conv-qe-4',
    role: 'assistant',
    content: `No — the apples stay firm. Maceration mostly draws out surface moisture through osmosis, it doesn't cook or break down the cell walls. Think of it like salting vegetables before roasting.

The apples will look wet and syrupy after 45 minutes, but once you drain them they'll feel barely different in texture. The payoff is huge: concentrated flavor in the reduced syrup, and way less liquid pooling in the crust during baking.

If you're worried, start with 30 minutes instead of 45 and see how it goes.`,
    isHistorical: true,
    timestamp: Date.now() - 285_000,
  },
]
