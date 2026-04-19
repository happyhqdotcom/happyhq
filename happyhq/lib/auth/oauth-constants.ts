// ── OAuth constants (single source of truth) ──────────────────────────

export const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
export const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize'
export const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
export const REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback'
export const SCOPES = [
  'org:create_api_key',
  'user:profile',
  'user:inference',
  'user:sessions:claude_code',
  'user:mcp_servers',
]
