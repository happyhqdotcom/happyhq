# Weekly Client Update

Specification for the weekly status email sent to clients every Friday.

## Document Structure

```
Subject line
Status summary (1 paragraph)
Completed this week (table)
In progress (table)
Blocked (table)
Risk register (table)
Metrics (RAG table)
Next week's focus (3 bullets)
```

## Subject Line

Format: `[Project Name] Weekly Update — [Date Range]`

Example: "Northstar Replatform Weekly Update — Jan 13–17, 2026"

## Status Summary

One paragraph, three sentences max. First sentence is the headline — on track, at risk, or behind. Second sentence explains why. Third sentence states the most important thing happening next week.

**Banned words**: "synergize", "leverage", "align", "holistic", "streamline", "robust"

**Auto-transform:**

| Input                          | Output                                   |
| ------------------------------ | ---------------------------------------- |
| "making good progress"         | state what was completed                 |
| "on track" (without specifics) | "on track: 4 of 6 deliverables complete" |
| "some challenges"              | name the specific blocker                |

## Completed This Week

| Column      | Description                   |
| ----------- | ----------------------------- |
| Deliverable | Name from the SOW Section 1.1 |
| Activity    | What was done — verb + object |
| Owner       | Person responsible            |

Rules:

- Every row names a specific deliverable — no "various tasks" or "ongoing work"
- Activities are past tense ("Completed stakeholder interviews" not "Stakeholder interviews")

## In Progress

Same columns as Completed. Activities are present tense ("Drafting technology audit report").

Include estimated completion: "Expected by Jan 24."

## Blocked

| Column        | Description                                                |
| ------------- | ---------------------------------------------------------- |
| Item          | What's blocked                                             |
| Blocker       | Specific reason — name the dependency, person, or decision |
| Impact        | What happens if not resolved — timeline slip, scope change |
| Action needed | Who needs to do what                                       |

Rules:

- Every blocker has a named owner for resolution
- "Waiting on client" is not specific enough — "Waiting on J. Smith to provide API credentials" is

## Risk Register

| Column     | Description               |
| ---------- | ------------------------- |
| Risk       | What could go wrong       |
| Likelihood | High / Medium / Low       |
| Impact     | High / Medium / Low       |
| Mitigation | What we're doing about it |
| Status     | Open / Mitigated / Closed |

Rules:

- New risks added this week are marked "(NEW)"
- Closed risks stay for one week after closure, then drop off
- Every open risk has an active mitigation — no "monitoring the situation"

## Metrics

RAG (Red/Amber/Green) status for each tracked metric.

| Metric              | Status          | Notes                          |
| ------------------- | --------------- | ------------------------------ |
| Timeline            | Green/Amber/Red | Brief explanation if not green |
| Budget              | Green/Amber/Red | Brief explanation if not green |
| Scope               | Green/Amber/Red | Brief explanation if not green |
| Client satisfaction | Green/Amber/Red | Brief explanation if not green |

Rules:

- Status changes from last week are noted: "Changed from Green to Amber"
- Red requires an action item in the Blocked or Risk section

## Next Week's Focus

Three bullets max. Each bullet is one sentence stating the most important activity and its expected outcome.

## Inputs Required

| Input                      | Source                    |
| -------------------------- | ------------------------- |
| Project tracker activities | Project management tool   |
| Deliverable status         | Team leads                |
| Risk updates               | Project manager           |
| Metric actuals             | Project tracker / finance |
| Client feedback            | Account manager           |

## Quality Checklist

- [ ] Status summary is three sentences or fewer
- [ ] No banned words
- [ ] Every completed item names a specific deliverable
- [ ] Every blocker has a named owner
- [ ] Every open risk has an active mitigation
- [ ] RAG status changes are noted
- [ ] Next week's focus is three bullets or fewer
- [ ] Sent by Friday 4pm
