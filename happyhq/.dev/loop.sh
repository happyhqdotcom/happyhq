#!/bin/bash
set -o pipefail
# Usage: ./loop.sh [plan] [max_iterations]
#   ./loop.sh              # Build mode, unlimited
#   ./loop.sh 20           # Build mode, max 20
#   ./loop.sh plan         # Plan mode, unlimited
#   ./loop.sh plan 5       # Plan mode, max 5
#   ./loop.sh plan-work "scope description"

# ANSI
DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
RESET='\033[0m'

STATS_FILE=$(mktemp /tmp/loop-stats.XXXXXX)

# Loop.sh is invoked from a worktree's repo root (where pnpm test runs).
# Capture it so kill_scoped can match processes by cwd.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Kill processes matching $1 whose cwd is under $REPO_ROOT — i.e. only
# processes this loop spawned, not the user's own dev/test runs in a
# sibling worktree.
kill_scoped() {
    local pattern="$1"
    local pid cwd
    for pid in $(pgrep -f "$pattern" 2>/dev/null); do
        cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ {sub(/^n/,""); print; exit}')
        if [[ -n "$cwd" && "$cwd" == "$REPO_ROOT"* ]]; then
            kill "$pid" 2>/dev/null || true
        fi
    done
}

cleanup() {
    echo -e "\nCleaning up child processes..."
    pkill -P $$ 2>/dev/null
    kill_scoped "node.*vitest"
    rm -f "$STATS_FILE"
    print_grand_total
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

if [ "$1" = "plan" ]; then
    MODE="plan"
    PROMPT_FILE="PROMPT_plan.md"
    MAX_ITERATIONS=${2:-0}
elif [ "$1" = "plan-work" ]; then
    if [ -z "$2" ]; then
        echo "Error: plan-work requires a scope description"
        exit 1
    fi
    MODE="plan-work"
    PROMPT_FILE="PROMPT_plan_work.md"
    WORK_SCOPE="$2"
    export WORK_SCOPE
    MAX_ITERATIONS=${3:-5}
elif [[ "$1" =~ ^[0-9]+$ ]]; then
    MODE="build"
    PROMPT_FILE="PROMPT_build.md"
    MAX_ITERATIONS=$1
else
    MODE="build"
    PROMPT_FILE="PROMPT_build.md"
    MAX_ITERATIONS=0
fi

ITERATION=0
CURRENT_BRANCH=$(git branch --show-current)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Cumulative stats
TOTAL_INPUT=0
TOTAL_OUTPUT=0
TOTAL_CACHE_READ=0
TOTAL_CACHE_CREATE=0
TOTAL_COST=0
TOTAL_ELAPSED=0

read_stats() {
    if [ -f "$STATS_FILE" ] && [ -s "$STATS_FILE" ]; then
        # Single node call to parse stats and compute new cumulative totals
        local result
        result=$(node -e "
            const s = JSON.parse(require('fs').readFileSync('${STATS_FILE}','utf8'));
            const r = {
                ti: ${TOTAL_INPUT} + (s.input||0),
                to: ${TOTAL_OUTPUT} + (s.output||0),
                cr: ${TOTAL_CACHE_READ} + (s.cacheRead||0),
                cc: ${TOTAL_CACHE_CREATE} + (s.cacheCreate||0),
                tc: ${TOTAL_COST} + (s.cost||0),
                te: ${TOTAL_ELAPSED} + (s.elapsed||0)
            };
            process.stdout.write([r.ti,r.to,r.cr,r.cc,r.tc,r.te].join(' '));
        ")
        read TOTAL_INPUT TOTAL_OUTPUT TOTAL_CACHE_READ TOTAL_CACHE_CREATE TOTAL_COST TOTAL_ELAPSED <<< "$result"
        > "$STATS_FILE"  # Clear for next iteration
    fi
}

format_duration() {
    local total_sec=$(( $1 / 1000 ))
    if [ $total_sec -lt 60 ]; then
        echo "${total_sec}s"
    elif [ $total_sec -lt 3600 ]; then
        echo "$(( total_sec / 60 ))m $(( total_sec % 60 ))s"
    else
        echo "$(( total_sec / 3600 ))h $(( (total_sec % 3600) / 60 ))m"
    fi
}

format_number() {
    printf "%'d" "$1"
}

print_grand_total() {
    if [ $ITERATION -eq 0 ]; then
        return
    fi
    local dur
    dur=$(format_duration "$TOTAL_ELAPSED")
    local in_fmt out_fmt
    in_fmt=$(format_number "$TOTAL_INPUT")
    out_fmt=$(format_number "$TOTAL_OUTPUT")
    local cost_fmt
    cost_fmt=$(node -e "process.stdout.write(Number(${TOTAL_COST}).toFixed(2))")

    echo ""
    echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "  ${BOLD}Run complete${RESET}"
    echo -e "  ${DIM}Iterations:${RESET} $ITERATION"
    echo -e "  ${DIM}Duration:${RESET}   $dur"
    echo -e "  ${DIM}Tokens:${RESET}     $in_fmt in · $out_fmt out"
    echo -e "  ${DIM}Cost:${RESET}       ~\$$cost_fmt"
    echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
}

echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${BOLD}Mode:${RESET}   $MODE"
echo -e "  ${BOLD}Prompt:${RESET} $PROMPT_FILE"
echo -e "  ${BOLD}Branch:${RESET} $CURRENT_BRANCH"
[ $MAX_ITERATIONS -gt 0 ] && echo -e "  ${BOLD}Max:${RESET}    $MAX_ITERATIONS iterations"
echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if [ ! -f "$PROMPT_FILE" ]; then
    echo "Error: $PROMPT_FILE not found"
    exit 1
fi

while true; do
    if [ $MAX_ITERATIONS -gt 0 ] && [ $ITERATION -ge $MAX_ITERATIONS ]; then
        echo -e "\n  ${YELLOW}Reached max iterations: $MAX_ITERATIONS${RESET}"
        break
    fi

    ITERATION=$((ITERATION + 1))

    # Iteration header
    if [ $MAX_ITERATIONS -gt 0 ]; then
        ITER_LABEL="Iteration $ITERATION/$MAX_ITERATIONS"
    else
        ITER_LABEL="Iteration $ITERATION"
    fi
    if [ $ITERATION -gt 1 ]; then
        # Show cumulative cost in separator
        local_cost=$(node -e "process.stdout.write(Number(${TOTAL_COST}).toFixed(2))")
        echo -e "\n  ${DIM}──────────────────────────────────────────${RESET}"
        if [ "$local_cost" != "0.00" ]; then
            echo -e "  ${BOLD}${ITER_LABEL}${RESET}${DIM} · ~\$$local_cost total${RESET}"
        else
            echo -e "  ${BOLD}${ITER_LABEL}${RESET}"
        fi
        echo -e "  ${DIM}──────────────────────────────────────────${RESET}\n"
    else
        echo -e "\n  ${BOLD}${ITER_LABEL}${RESET}\n"
    fi

    export LOOP_ITERATION=$ITERATION
    export LOOP_MAX=$MAX_ITERATIONS
    export LOOP_STATS_FILE=$STATS_FILE

    if [ "$MODE" = "plan-work" ]; then
        envsubst < "$PROMPT_FILE" | claude -p \
            --dangerously-skip-permissions \
            --output-format=stream-json \
            --model opus \
            --verbose 2>&1 | node "$SCRIPT_DIR/format-stream.mjs"
    else
        cat "$PROMPT_FILE" | claude -p \
            --dangerously-skip-permissions \
            --output-format=stream-json \
            --model opus \
            --verbose 2>&1 | node "$SCRIPT_DIR/format-stream.mjs"
    fi

    CLAUDE_EXIT=$?
    if [ $CLAUDE_EXIT -ne 0 ]; then
        echo -e "  ${YELLOW}Claude exited with status $CLAUDE_EXIT — stopping loop${RESET}"
        break
    fi

    # Read stats from this iteration
    read_stats

    # Clean up any orphaned vitest/node workers from this iteration
    kill_scoped "node.*vitest"
    sleep 1

    # Show what was committed this iteration
    DIFF_STAT=$(git diff --stat HEAD~1 HEAD 2>/dev/null | tail -1)
    if [ -n "$DIFF_STAT" ]; then
        echo -e "  ${DIM}${DIFF_STAT}${RESET}"
    fi

    # Git push with styled output
    if git push origin "$CURRENT_BRANCH" 2>/dev/null; then
        echo -e "  ${GREEN}⬆${RESET} Pushed to ${CYAN}${CURRENT_BRANCH}${RESET}"
    else
        echo -e "  ${DIM}Creating remote branch...${RESET}"
        if git push -u origin "$CURRENT_BRANCH" 2>/dev/null; then
            echo -e "  ${GREEN}⬆${RESET} Pushed to ${CYAN}${CURRENT_BRANCH}${RESET} (new)"
        else
            echo -e "  ${YELLOW}⚠ Push failed${RESET}"
        fi
    fi
done

# Grand total is printed by the EXIT trap via cleanup
