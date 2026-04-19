// Markdown string fixtures for stress testing the markdown renderer.
// All themed around apple pie recipes and baking techniques.

export const MD_HEADINGS = `# The Ultimate Apple Pie Guide

## Choosing Your Apples

### Tart Varieties

#### Granny Smith

##### Acidity Profile

###### Malic Acid Content

Each heading level should render with decreasing font size and proper spacing.
The hierarchy helps organize complex recipes into navigable sections.
`

export const MD_INLINE = `Apple pie is **the quintessential** American dessert. The *perfect* pie balances
~~boring~~ bold flavors with delicate texture. Use \`2 tbsp\` of cornstarch for thickening.

Try a **_bold italic_** combination for emphasis. Here's some ~~strikethrough~~ text mixed with
\`inline code\` and [a link to the recipe](https://example.com/apple-pie).

Combine **bold text with \`inline code\` inside** for maximum emphasis. You can also nest
*italic text with [a link](https://example.com) inside* for variety.
`

export const MD_CODE_BLOCKS = `## Apple Pie Timer (JavaScript)

\`\`\`javascript
function bakePie(temperature, minutes) {
  const oven = preheat(temperature);
  const timer = setInterval(() => {
    const elapsed = getElapsed();
    console.log(\`Baking: \${elapsed}m / \${minutes}m\`);
    if (elapsed >= minutes) {
      clearInterval(timer);
      oven.turnOff();
      console.log('Pie is done! Let cool for 2 hours.');
    }
  }, 60000);
  return timer;
}

bakePie(425, 45);
\`\`\`

## Filling Calculator (Python)

\`\`\`python
def calculate_filling(num_pies: int = 1) -> dict:
    """Calculate apple pie filling ingredients."""
    base = {
        "apples_lbs": 2.5,
        "sugar_cups": 0.75,
        "brown_sugar_cups": 0.25,
        "cinnamon_tsp": 1.5,
        "nutmeg_tsp": 0.25,
        "allspice_tsp": 0.125,
        "salt_tsp": 0.25,
        "lemon_juice_tbsp": 1,
        "cornstarch_tbsp": 2,
        "butter_tbsp": 2,
        "vanilla_tsp": 1,
    }
    scaled = {k: round(v * num_pies, 3) for k, v in base.items()}

    print(f"Filling for {num_pies} pie(s):")
    for ingredient, amount in scaled.items():
        name = ingredient.rsplit("_", 1)
        unit = name[-1]
        label = " ".join(name[:-1]).replace("_", " ").title()
        print(f"  {label}: {amount} {unit}")

    return scaled


if __name__ == "__main__":
    import sys
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    calculate_filling(n)

    # Validate ratios
    result = calculate_filling(3)
    assert result["apples_lbs"] == 7.5
    assert result["sugar_cups"] == 2.25
    assert result["cinnamon_tsp"] == 4.5

    # Temperature conversion helpers
    def f_to_c(f: float) -> float:
        return round((f - 32) * 5 / 9, 1)

    def c_to_f(c: float) -> float:
        return round(c * 9 / 5 + 32, 1)

    temps = [350, 375, 400, 425, 450]
    for t in temps:
        print(f"  {t}°F = {f_to_c(t)}°C")
\`\`\`

## Deployment Script (Shell)

\`\`\`bash
#!/bin/bash
# Deploy the pie recipe API
set -euo pipefail

TEMP=425
DURATION=45

echo "Preheating oven to \${TEMP}°F..."
sleep 2
echo "Oven ready."

echo "Baking for \${DURATION} minutes..."
for i in $(seq 1 $DURATION); do
  echo "Minute $i/$DURATION"
done
echo "Done!"
\`\`\`
`

export const MD_TABLES = `## Simple Comparison Table

| Apple Variety  | Sweetness | Tartness | Best For      |
| -------------- | --------- | -------- | ------------- |
| Granny Smith   | Low       | High     | Classic pies  |
| Honeycrisp     | High      | Medium   | Sweet pies    |
| Braeburn       | Medium    | Medium   | Balanced pies |
| Pink Lady      | Medium    | High     | Tart pies     |
| Golden Delish  | High      | Low      | Sweet filling |

## Wide Table (8+ columns)

| Variety | Origin | Season | Sweetness | Tartness | Texture | Holds Shape | Best Use | Price/lb | Notes |
| ------- | ------ | ------ | --------- | -------- | ------- | ----------- | -------- | -------- | ----- |
| Granny Smith | Australia | Oct-Apr | 2/10 | 9/10 | Firm | Yes | Pies, tarts | $1.49 | The classic choice for baking |
| Honeycrisp | Minnesota | Sep-Feb | 8/10 | 4/10 | Crisp | Moderate | Fresh, salads | $2.99 | Patented variety, expensive |
| Braeburn | New Zealand | Oct-Jun | 6/10 | 6/10 | Firm | Yes | All-purpose | $1.79 | Good balance of sweet and tart |
| Fuji | Japan | Year-round | 9/10 | 2/10 | Crisp | No | Fresh eating | $1.99 | Very sweet, low acid |
| Cortland | New York | Sep-Nov | 5/10 | 5/10 | Soft | No | Sauce, butter | $1.29 | Doesn't brown quickly |
| Northern Spy | New York | Oct-Nov | 4/10 | 8/10 | Firm | Yes | Pies only | $2.49 | Hard to find but worth it |
| Jonagold | New York | Sep-Nov | 7/10 | 5/10 | Crisp | Moderate | Pies, fresh | $1.89 | Cross of Jonathan × Golden Delicious |
| McIntosh | Canada | Sep-Nov | 6/10 | 6/10 | Soft | No | Sauce | $1.19 | Breaks down when cooked |

## Table with Long Cell Content

| Step | Instructions | Duration | Temperature |
| ---- | ------------ | -------- | ----------- |
| 1 | Peel, core, and slice 2.5 lbs of apples into 1/4-inch thick slices. Toss with lemon juice immediately to prevent browning. Combine sugar, spices, and cornstarch in a separate bowl. | 20 min | Room temp |
| 2 | Roll out the bottom crust to 12 inches diameter, about 1/8 inch thick. Carefully transfer to a 9-inch pie plate, pressing gently into the corners without stretching. Trim overhang to 1 inch. Refrigerate while preparing filling. | 15 min | Cold |
| 3 | Toss apple slices with the sugar-spice mixture until evenly coated. Let macerate for 10 minutes, then drain excess liquid. Reduce liquid in a small saucepan until syrupy (about 2 tablespoons), then toss back with apples. | 15 min | Room temp |
| 4 | Mound filling into prepared crust, dot with butter pieces. Roll out top crust, place over filling, and crimp edges decoratively. Cut 4-6 steam vents. Brush with egg wash (1 egg + 1 tbsp water) and sprinkle with coarse sugar. | 10 min | Room temp |
| 5 | Bake on lowest rack at 425°F for 20 minutes with a baking sheet underneath to catch drips. Reduce temperature to 375°F and continue baking 25-35 minutes until crust is deep golden brown and filling bubbles through vents. | 45-55 min | 425→375°F |
`

export const MD_LISTS = `## Unordered List

- Granny Smith apples
- Honeycrisp apples
- Braeburn apples
- Pink Lady apples

## Ordered List

1. Preheat oven to 425°F
2. Prepare the crust
3. Make the filling
4. Assemble the pie
5. Bake until golden

## Nested Lists (3 Deep)

- Crust
  - Flour-based
    - All-purpose flour
    - Pastry flour
    - Whole wheat flour
  - Alternative
    - Graham cracker
    - Shortbread
    - Puff pastry
- Filling
  - Apples
    - Tart varieties
    - Sweet varieties
    - Mix of both
  - Spices
    - Cinnamon
    - Nutmeg
    - Allspice
- Topping
  - Lattice
    - Traditional weave
    - Diagonal pattern
  - Crumble
    - Oat-based
    - Brown sugar streusel

## Mixed Lists

1. Prepare ingredients
   - 2.5 lbs apples
   - 3/4 cup sugar
   - 1.5 tsp cinnamon
2. Make the crust
   - Cut butter into flour
   - Add ice water gradually
   - Form into two discs
3. Assemble
   1. Roll bottom crust
   2. Add filling
   3. Add top crust
   4. Crimp edges

## Task Lists

- [x] Buy apples (Granny Smith + Honeycrisp mix)
- [x] Make pie dough and refrigerate overnight
- [x] Peel and slice apples
- [ ] Prepare spice mixture
- [ ] Assemble and bake
- [ ] Let cool for 2 hours before serving
`

export const MD_EDGE_CASES = `## Adjacent Code Blocks

\`\`\`javascript
const apples = ['Granny Smith', 'Honeycrisp'];
\`\`\`

\`\`\`python
apples = ["Granny Smith", "Honeycrisp"]
\`\`\`

\`\`\`bash
echo "Granny Smith Honeycrisp"
\`\`\`

## Long Unbroken Strings

Here is a very long word: Supercalifragilisticexpialidociousapplepiebakingextravaganzawithcinnamonandnutmegandallspiceandvanillaextract

And a long URL: https://example.com/recipes/apple-pie/variations/double-crust-with-lattice-top-and-crumble-edge-golden-delicious-granny-smith-honeycrisp-blend?serving_size=8&temp=425&duration=45&crust=butter&spices=cinnamon,nutmeg,allspice

## Emoji

The best apple pie 🍎🥧 requires patience ⏰ and love ❤️.

Rating: ⭐⭐⭐⭐⭐ (5/5)

Steps: 1️⃣ Prep → 2️⃣ Mix → 3️⃣ Bake → 4️⃣ Cool → 5️⃣ Eat! 🎉

## HTML Entities

Temperature: 425&deg;F (218&deg;C)

Fractions: &frac12; cup sugar &bull; &frac14; tsp salt &bull; &frac34; cup flour

Copyright &copy; 2024 Apple Pie Co. &mdash; All rights reserved.

## Special Characters

Use "curly quotes" and 'single quotes' — em dashes — and ellipses...

The ratio is 2:1 apples to sugar. Temperature range: 375°F–425°F.

## Horizontal Rules

Above the rule.

---

Below the rule.

***

Another section.
`

export const MD_KITCHEN_SINK = `# The Complete Apple Pie Handbook 🥧

## Introduction

Apple pie is **the quintessential** American dessert. The *perfect* pie balances
~~boring~~ bold flavors with delicate texture. Use \`2 tbsp\` of cornstarch as your
thickener of choice — [learn why](https://example.com/thickeners).

## Choosing Your Apples

### Tart Varieties

#### Granny Smith

##### Acidity Profile

###### Malic Acid Content

The best pies use a **_blend of varieties_** for complex flavor.

## Variety Comparison

| Variety      | Sweetness | Tartness | Holds Shape |
| ------------ | --------- | -------- | ----------- |
| Granny Smith | Low       | High     | Yes         |
| Honeycrisp   | High      | Medium   | Moderate    |
| Braeburn     | Medium    | Medium   | Yes         |

## Shopping List

- [x] Buy apples (Granny Smith + Honeycrisp mix)
- [x] Make pie dough and refrigerate overnight
- [ ] Prepare spice mixture
- [ ] Assemble and bake

### Ingredients

- Crust
  - 2.5 cups all-purpose flour
  - 1 cup cold butter
    - Cut into small cubes
    - Keep refrigerated until use
- Filling
  - 2.5 lbs apples
  - 3/4 cup sugar

### Steps

1. Preheat oven to 425°F
2. Prepare the crust
   - Cut butter into flour
   - Add ice water
3. Make the filling
   1. Peel and slice apples
   2. Toss with spices
   3. Let macerate 10 minutes

## Filling Calculator

\`\`\`python
def calculate_filling(num_pies: int = 1) -> dict:
    """Calculate apple pie filling ingredients."""
    base = {
        "apples_lbs": 2.5,
        "sugar_cups": 0.75,
        "cinnamon_tsp": 1.5,
    }
    return {k: round(v * num_pies, 3) for k, v in base.items()}
\`\`\`

\`\`\`javascript
function bakePie(temp, minutes) {
  console.log(\`Baking at \${temp}°F for \${minutes}m\`);
}
\`\`\`

## Baking Notes

Temperature: 425°F (218°C) → reduce to 375°F after 20 minutes.

> "The secret to a great apple pie is patience — let it cool for at least
> 2 hours before cutting." — Every pie baker ever

The ratio is 2:1 apples to sugar. Use \`lemon juice\` to prevent browning.

---

## Rating

⭐⭐⭐⭐⭐ Best pie recipe! The **_bold italic emphasis_** on technique
makes all the difference. Visit [the full guide](https://example.com) for more.

*Happy baking!*
`
