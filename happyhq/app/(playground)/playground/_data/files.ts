import type { StagedFile } from '@/stores/chatStore'

// --- StagedFile fixtures ---

export const STAGED_FILE_PDF: StagedFile = {
  id: 'staged-pdf-1',
  name: 'grandmas-apple-pie-original.pdf',
  file: new File([], 'grandmas-apple-pie-original.pdf', {
    type: 'application/pdf',
  }),
}

export const STAGED_FILE_DOCX: StagedFile = {
  id: 'staged-docx-1',
  name: 'my-apple-pie-notes.docx',
  file: new File([], 'my-apple-pie-notes.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }),
}

export const STAGED_FILE_EMAIL: StagedFile = {
  id: 'staged-eml-1',
  name: 'thanksgiving-plan.eml',
  file: new File([], 'thanksgiving-plan.eml', { type: 'message/rfc822' }),
}

export const STAGED_FILES_MULTIPLE: StagedFile[] = [
  STAGED_FILE_PDF,
  STAGED_FILE_DOCX,
  STAGED_FILE_EMAIL,
]

// --- Filename fixtures (for FilePill variants) ---

export const FILENAME_PDF = 'grandmas-apple-pie-original.pdf'
export const FILENAME_DOCX = 'my-apple-pie-notes.docx'
export const FILENAME_EML = 'thanksgiving-plan.eml'
export const FILENAME_XLSX = 'pie-ingredient-costs.xlsx'
export const FILENAME_CSV = 'bake-time-log.csv'
export const FILENAME_UNKNOWN = 'README.txt'

export const FILENAMES_MULTIPLE = [
  FILENAME_PDF,
  FILENAME_DOCX,
  FILENAME_EML,
  FILENAME_XLSX,
  FILENAME_CSV,
]

// --- File preview fixtures (for FilePreviewCard / WritingPreview.filePreview) ---

export const FILE_PREVIEW_SHORT = {
  filePath: 'specs/apple-pie-variations.md',
  content: `# Apple Pie — Variations

## Dutch Apple (Crumb Top)
Replace the top crust with a streusel topping:
- 1 cup flour, ½ cup brown sugar, ½ cup cold butter
- Pinch of cinnamon and salt
- Press together into clumps, scatter over filling
- Bake at 375°F for 45–50 min (no blind bake needed)

## Salted Caramel Apple
Add to the standard filling:
- ¼ cup homemade caramel sauce, drizzled between apple layers
- ½ tsp flaky sea salt on top crust before baking
- Reduce sugar in filling to ½ cup (caramel adds sweetness)

## Mini Hand Pies
- Use standard crust recipe, roll thinner (⅛ inch)
- Cut 5-inch rounds, fill with 2 tbsp filling each
- Fold, crimp with fork, egg wash
- Bake 400°F for 18–22 min`,
}

export const FILE_PREVIEW_LONG = {
  filePath: 'specs/apple-pie.md',
  content: `# Apple Pie — All-Butter Double Crust

## Overview
Classic American apple pie with a flaky all-butter crust, Honeycrisp-Granny Smith filling, and a maceration technique that concentrates flavor and prevents soggy bottoms.

## Crust

### Ingredients
- 2½ cups all-purpose flour
- 1 cup (2 sticks) unsalted butter, frozen 30 min
- 1 tsp salt
- 1 tbsp sugar
- 6–8 tbsp ice water

### Method
1. Whisk flour, salt, and sugar
2. Grate frozen butter on box grater directly into flour
3. Toss gently — pea-sized pieces are fine, streaks are better
4. Add ice water 1 tbsp at a time, folding with spatula
5. Stop when dough just holds together (don't overwork)
6. Split into 2 discs, wrap in plastic
7. Refrigerate minimum 1 hour, overnight preferred

## Filling

### Ingredients
- 3 lbs apples (2:1 Honeycrisp to Granny Smith)
- ¾ cup granulated sugar
- 2 tbsp lemon juice
- 2 tsp cinnamon
- ¼ tsp nutmeg
- ¼ tsp allspice
- Pinch of salt
- 2 tbsp cornstarch
- 1 tbsp bourbon (optional)

### Maceration (Key Step)
1. Peel, core, slice apples ¼-inch thick
2. Toss with sugar, spices, lemon juice, and bourbon
3. Let sit 1–2 hours in a colander over a bowl
4. Reserve the drained liquid — simmer until reduced to 2 tbsp
5. Toss reduced syrup back with apples right before filling

This pulls excess moisture out before baking so the bottom crust stays flaky.

### Assembly
1. Roll bottom disc to 12-inch round, fit into 9-inch pie plate
2. Add filling, mounding slightly in center
3. Roll top disc to 11-inch round, lay over filling
4. Trim edges to 1-inch overhang, fold under, crimp
5. Cut 4–5 vents in top crust
6. Brush with egg wash (1 egg + 1 tbsp cream)
7. Sprinkle with coarse sugar

## Baking
- Preheat oven to 425°F with rack in lower third
- Bake 20 min at 425°F
- Reduce to 375°F, bake 35–45 min more
- Shield edges with foil if browning too fast
- Done when juices bubble through vents and crust is deep golden

## Cooling
- Cool minimum 4 hours before slicing (filling needs to set)
- The pie will look like soup inside if cut too early
- Room temperature is fine — no need to refrigerate until day 2

## Troubleshooting
| Problem | Cause | Fix |
|---------|-------|-----|
| Soggy bottom | Too much liquid | Macerate longer, reduce syrup more |
| Pale crust | Oven too low | Use bottom rack, verify oven temp |
| Filling too sweet | Apple variety | Increase Granny Smith ratio |
| Crust tears | Dough too cold | Let sit 5 min before rolling |
| Shrinks in pan | Overworked dough | Handle less, chill longer |`,
}
