# Debugging Q

## Debug bundle export

Click the bug icon in any chat header to download a JSON file containing:

- The raw SDK conversation journal (every message, tool call, tool result, thinking block)
- Stream context (playbook, specs)
- Chat metadata and environment info

Drop exported bundles in `app/.debug/` (gitignored) while investigating.

## Diagnosis patterns

**Something missing from the UI?** Export the debug bundle and inspect the raw journal. If the journal contains events the UI didn't render, it's a rendering issue. If the journal is missing them, the problem is upstream in the SDK or agent.

**Chat hung?** Export the debug bundle. Read the `rawJournal` field — each line is a JSON object. Look for the last assistant message to see what tool the agent was trying to call, or whether it was waiting for a user confirmation.
