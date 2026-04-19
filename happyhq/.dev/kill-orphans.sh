#!/bin/bash
echo "Killing orphaned vitest processes..."
pkill -f "node.*vitest" 2>/dev/null
echo "Killing orphaned claude processes..."
pkill -f "claude.*-p" 2>/dev/null
echo "Done. Remaining processes:"
ps aux | grep -E 'vitest|claude' | grep -v grep
