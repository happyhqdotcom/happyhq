import type { ChatMessage } from '@/lib/chat/types'

// ---------------------------------------------------------------------------
// User message fixtures
// ---------------------------------------------------------------------------

export const USER_MESSAGE_PLAIN: ChatMessage = {
  id: 'user-plain',
  role: 'user',
  content:
    "I want to teach you how I make apple pie. It's my grandmother's recipe and I've been tweaking it for years — there are some non-obvious steps that really matter.",
  timestamp: Date.now() - 600_000,
}

export const USER_MESSAGE_WITH_FILES: ChatMessage = {
  id: 'user-with-files',
  role: 'user',
  content:
    "Here's the recipe card my grandmother wrote out, plus a version I typed up with my own notes.",
  files: ['grandmas-apple-pie-original.pdf', 'my-apple-pie-notes.docx'],
  timestamp: Date.now() - 580_000,
}

export const USER_MESSAGE_LONG: ChatMessage = {
  id: 'user-long',
  role: 'user',
  content: `Okay, let me walk you through the whole process from start to finish. This is how I've been making it for the last ten years, and every step matters.

First, the crust. You need to freeze the butter for at least 30 minutes — I usually do an hour to be safe. Then you grate it on a box grater directly into the flour mixture. The key is working fast so the butter doesn't warm up. Once it's all in there, toss it gently — you want pea-sized pieces and visible streaks of butter through the flour. Add ice water one tablespoon at a time, folding with a spatula, and stop the second the dough holds together. Overworking is the number one mistake people make. Split into two discs, wrap tight, and refrigerate for at least an hour. Overnight is better.

For the filling, I use a 2:1 ratio of Honeycrisp to Granny Smith. The Honeycrisp gives you sweetness and that almost floral flavor, while the Granny Smith keeps everything balanced with acidity. Peel and slice them about ¼ inch thick — not too thin or they'll turn to mush, not too thick or you get raw apple pockets. Toss with ¾ cup sugar, 2 tsp cinnamon, ¼ tsp nutmeg, and 1 tablespoon of bourbon (trust me on this). Then the critical step: let it macerate for 45 minutes. This draws out moisture. After maceration, drain the liquid into a small saucepan and reduce it to a thick syrup — about 3-4 minutes on medium-high. Fold the syrup back into the apples along with 2 tbsp flour and 1 tbsp cornstarch.

Assembly: blind-bake the bottom crust at 425°F for 15 minutes with pie weights. This prevents the dreaded soggy bottom. Let it cool slightly, then pile in the filling — mound it high because it'll shrink. Add the top crust, crimp the edges, cut vents, brush with egg wash, and sprinkle coarse sugar on top.

Baking is a two-temperature process: 425°F for 20 minutes to set the crust, then drop to 375°F for 35-40 minutes. You're done when the juices bubble through the vents and the crust is deep golden brown. And then — this is the hardest part — you have to let it cool for at least 2 hours before cutting. The filling needs time to set up or it'll be apple soup.`,
  timestamp: Date.now() - 570_000,
}

// ---------------------------------------------------------------------------
// Assistant message fixtures
// ---------------------------------------------------------------------------

export const ASSISTANT_MESSAGE_SHORT: ChatMessage = {
  id: 'assistant-short',
  role: 'assistant',
  content:
    "Got it — I'll use the all-butter double crust with the Honeycrisp-Granny Smith blend. Let me read through your notes and pull out the key techniques.",
  timestamp: Date.now() - 590_000,
}

export const ASSISTANT_MESSAGE_RICH: ChatMessage = {
  id: 'assistant-rich',
  role: 'assistant',
  content: `## Apple Pie Spec — All-Butter Double Crust

Based on your recipes and preferences, here's the full breakdown:

### Crust (makes top + bottom)

| Ingredient | Amount | Notes |
|---|---|---|
| All-purpose flour | 2½ cups | Sifted |
| Unsalted butter | 1 cup (2 sticks) | Frozen 30 min, grated |
| Salt | 1 tsp | |
| Sugar | 1 tbsp | |
| Ice water | 6–8 tbsp | Add 1 tbsp at a time |

**Critical technique:** Freeze butter, grate on box grater, work fast. Rest dough in fridge **minimum 1 hour** (overnight is better).

### Filling

- \`3 lbs\` apples — **2:1 Honeycrisp to Granny Smith**
- \`¾ cup\` sugar, \`1 tbsp\` bourbon, \`2 tsp\` cinnamon, \`¼ tsp\` nutmeg
- \`2 tbsp\` flour + \`1 tbsp\` cornstarch (thickener combo)
- Macerate 45 min → drain → **reduce liquid to syrup** → fold back in

### Bake Schedule

\`\`\`
Step 1: Blind-bake bottom crust  425°F  15 min  (with pie weights)
Step 2: Fill + top crust          —      —
Step 3: Initial bake             425°F  20 min  (sets the crust)
Step 4: Finish bake              375°F  35-40 min (until bubbly)
Step 5: Cool                      —      2 hours minimum
\`\`\`

> **Pro tip:** If the edges brown too fast, tent with foil after the first 20 minutes at 425°F.`,
  timestamp: Date.now() - 550_000,
}
