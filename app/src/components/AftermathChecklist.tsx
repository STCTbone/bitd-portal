import { useState } from 'react'

const steps = [
  { title: 'Payout', rule: 'Settle the score’s stacks, Rep and faction status changes.' },
  { title: 'Tithe', rule: 'Pay crew Tier + 1 stacks to the ward boss, or tick Anger once. At four ticks, lose 1 boss status. Skip if you have no ward boss.' },
  { title: 'Heat', rule: 'Take 0 / 2 / 4 / 6 Heat for quiet / contained / loud / devastating exposure, then apply modifiers. Reaching 9 Heat adds 1 Wanted and clears Heat.' },
  { title: 'Harm Complications', rule: 'Each injured PC rolls dice equal to the sum of their Harm levels. Use the highest die and the table for their worst Harm. Hulls use their Damage tables.' },
  { title: 'Unwind', rule: 'Choose a group scene. Each participating PC clears 1 Stress; Quarters also clears all Passing Harm.' },
  { title: 'Trouble', rule: 'Resolve, delay or skip Crew and Local Trouble. Review ongoing threats; don’t immediately escalate Trouble you just introduced.' },
]

/** Review ticks belong to this draft; applying effects remains an explicit GM action. */
export function AftermathChecklist({ canReview }: { canReview: boolean }) {
  const [reviewed, setReviewed] = useState<string[]>([])
  const next = steps.find(step => !reviewed.includes(step.title))?.title
  return <section className="aftermath-checklist" aria-label="Aftermath checklist">
    <div className="aftermath-checklist-heading">
      <h4>Aftermath checklist</h4>
      {canReview && <span role="status">{reviewed.length} of {steps.length} steps reviewed</span>}
    </div>
    <ol>
      {steps.map((step, index) => <li key={step.title} aria-current={canReview && next === step.title ? 'step' : undefined} className={canReview && reviewed.includes(step.title) ? 'is-reviewed' : ''}>
        <div className="aftermath-step-heading">
          <span className="aftermath-step-number" aria-hidden="true">{index + 1}</span>
          <div><h5>{step.title}</h5>{canReview && <label><input type="checkbox" aria-label={`${step.title} reviewed`} checked={reviewed.includes(step.title)} onChange={event => setReviewed(previous => event.target.checked ? [...previous, step.title] : previous.filter(title => title !== step.title))} />Reviewed</label>}</div>
        </div>
        <div className="aftermath-step-rule"><p>{step.rule}</p>
          {step.title === 'Heat' && <details><summary>Heat modifiers</summary><p>Target prominence +1 / +3; hostile turf +1; war +1; killing +2; explosives +1; military weapons +1. Apply relevant claims and abilities.</p></details>}
        </div>
      </li>)}
    </ol>
  </section>
}
