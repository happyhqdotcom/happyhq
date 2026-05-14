import type { AskUserQuestionInput } from '@/lib/chat/types'

/**
 * Single question — crust type preference.
 */
export const QUESTIONS_SINGLE: AskUserQuestionInput['questions'] = [
  {
    question: 'What type of crust do you prefer for your apple pie?',
    header: 'Crust type',
    options: [
      {
        label: 'Butter crust',
        description: 'Flaky, rich, and golden — classic all-butter pastry',
      },
      {
        label: 'Shortcrust',
        description: 'Firm and crumbly — holds up well with juicy fillings',
      },
      {
        label: 'Lattice top',
        description:
          'Woven strips for a decorative finish with peek-through filling',
      },
    ],
    multiSelect: false,
  },
]

/**
 * Two questions — crust type + apple variety. Renders with tabs.
 */
export const QUESTIONS_MULTI: AskUserQuestionInput['questions'] = [
  ...QUESTIONS_SINGLE,
  {
    question: 'Which apple variety should we use for the filling?',
    header: 'Apple variety',
    options: [
      {
        label: 'Granny Smith',
        description: 'Tart and firm — holds its shape during baking',
      },
      {
        label: 'Honeycrisp',
        description: 'Sweet-tart with a satisfying crunch',
      },
      {
        label: 'Mixed blend',
        description:
          'Combine Granny Smith + Honeycrisp for balanced flavor and texture',
      },
    ],
    multiSelect: false,
  },
]

/**
 * Options with longer descriptions to test text wrapping.
 */
export const QUESTIONS_WITH_DESCRIPTIONS: AskUserQuestionInput['questions'] = [
  {
    question:
      'How should we handle the apple filling to prevent a soggy bottom crust?',
    header: 'Filling technique',
    options: [
      {
        label: 'Par-cook on stovetop',
        description:
          "Saute sliced apples with sugar and spices for 5-7 minutes until they release moisture, then cool before filling. This pre-shrinks the fruit so the top crust doesn't collapse and the bottom stays crisp.",
      },
      {
        label: 'Macerate overnight',
        description:
          'Toss apple slices with sugar and let them sit in the fridge for 8-12 hours. Drain the liquid (save it for a glaze), then fill the pie. The slow osmotic draw removes excess moisture without any cooking.',
      },
      {
        label: 'Raw fill with thickener',
        description:
          'Use raw apple slices tossed with a generous amount of cornstarch or tapioca flour. The starch absorbs juice as it bakes, creating a gel that keeps the crust from getting soggy. Simplest method but requires precise thickener ratios.',
      },
    ],
    multiSelect: false,
  },
]

/**
 * Multi-select — user can pick any number of options. UI renders checkboxes.
 */
export const QUESTIONS_MULTI_SELECT: AskUserQuestionInput['questions'] = [
  {
    question: 'Which spices should we include in the filling?',
    header: 'Spices',
    options: [
      { label: 'Cinnamon', description: 'Warm and classic' },
      { label: 'Nutmeg', description: 'Nutty, slightly sweet' },
      { label: 'Cardamom', description: 'Floral and aromatic' },
      { label: 'Allspice', description: 'Peppery, complex' },
    ],
    multiSelect: true,
  },
]
