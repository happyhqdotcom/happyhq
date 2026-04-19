export const CONFIRMATION_BASH = {
  toolName: 'Bash',
  input: { command: "git commit -m 'Add apple pie spec'" },
}

export const CONFIRMATION_READ = {
  toolName: 'Read',
  input: { file_path: '/recipes/apple-pie.md' },
}

export const CONFIRMATION_WRITE = {
  toolName: 'Write',
  input: {
    file_path: '/specs/apple-pie-variations.md',
    content:
      '# Apple Pie Variations\n\n## Dutch Apple Pie\nStreusel topping instead of pastry.\n\n## French Apple Pie\nCustard layer beneath the apples.',
  },
}

export const CONFIRMATION_GREP = {
  toolName: 'Grep',
  input: { pattern: 'maceration time' },
}

export const CONFIRMATION_WEB_SEARCH = {
  toolName: 'WebSearch',
  input: { query: 'best apple pie thickener ratio' },
}

export const CONFIRMATION_WEB_FETCH = {
  toolName: 'WebFetch',
  input: { url: 'https://www.seriouseats.com/apple-pie-science' },
}

export const CONFIRMATION_GENERIC = {
  toolName: 'CustomTool',
  input: { key: 'value' },
}
