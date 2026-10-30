// Scripted sample content. Nothing here is generated live — these hearings are illustrations
// of how a Vichaar Sabha review flows. Swap this module for an API client later.

export const STATEMENT_MS = 8200;

export const ROLES = {
  paksh: {
    id: 'paksh', name: 'Paksh', title: 'The advocate', motto: 'Find the possibility.',
    bio: 'Builds the strongest honest case for the idea — who it helps, why now, and the smallest version worth trying.',
    looksFor: ['Who benefits, and why now', 'The smallest version worth testing', 'Honest upside, not hype'],
    anchor: { x: 0.216, y: 0.514 }, r: 0.032, plate: { x: 0.215, y: 0.655 },
  },
  judge: {
    id: 'judge', name: 'Judge', title: 'The presiding judge', motto: 'Find the next step.',
    bio: 'Weighs both sides, separates what is known from what is hoped, and closes with a conditional verdict and one experiment.',
    looksFor: ['What is known versus hoped', 'What would change the verdict', 'One clear next experiment'],
    anchor: { x: 0.5, y: 0.458 }, r: 0.023, plate: { x: 0.5, y: 0.598 },
  },
  vipaksh: {
    id: 'vipaksh', name: 'Vipaksh', title: 'The challenger', motto: 'Ask the better question.',
    bio: 'Tests the idea where it is most likely to break — demand, alternatives, cost and trust — and asks for evidence, not enthusiasm.',
    looksFor: ['Proof of demand', 'Overlooked alternatives', 'Costs, trust and practical risk'],
    anchor: { x: 0.779, y: 0.553 }, r: 0.026, plate: { x: 0.785, y: 0.69 },
  },
};

export const OBJECTIONS = [
  { id: 'demand', label: 'Demand is unproven', hint: 'Interest or praise is being treated as real behaviour.' },
  { id: 'alternative', label: 'An alternative is missing', hint: 'People may already solve this another way.' },
  { id: 'risk', label: 'A practical risk matters', hint: 'Cost, safety, trust or effort could break it.' },
];

export const isApproved = (kase) => kase?.verdict?.outcome === 'approved';

export function rulingStatus(text) {
  if (!text) return '';
  if (text.startsWith('Sustained in part')) return 'Sustained in part';
  if (text.startsWith('Sustained')) return 'Sustained';
  if (text.startsWith('Overruled')) return 'Overruled';
  if (text.startsWith('Noted')) return 'Noted';
  const m = text.match(/^([A-Z][a-z]+(?:\s+in\s+part)?)/);
  return m ? m[1] : '';
}

export const CASES = [
  {
    id: 'gear', number: '014', title: 'Campus gear', headline: 'Less buying. More making.',
    brief: 'Rent cameras and tools within your college — borrow what you need for a project instead of buying it.',
    goal: 'A useful campus pilot',
    exhibits: [{ id: 'gear-1', kind: 'note', title: 'Three students said they would try it.', detail: 'Interest is not yet a paid rental.', sample: true }],
    script: [
      { speaker: 'paksh', note: 'Idle gear and informal borrowing suggest a real need.', text: 'A good camera should be making memories, not sitting in a cupboard. Students already borrow from friends informally. A trusted campus rental could make better gear affordable for the one project that needs it.' },
      { speaker: 'vipaksh', note: 'Damage and disputes could cost more than rentals earn.', text: 'One damaged camera could erase a month of savings. Who pays when a lens comes back scratched — and who settles the argument the night before a deadline? Trust is the product here, not the listing.' },
      { speaker: 'paksh', note: 'Pilot with one club, a few items, supervised handovers.', text: 'Then start smaller than an app. One club, five items, supervised handovers at a fixed desk. If the service works by hand, the software will have something real to automate.' },
      { speaker: 'vipaksh', note: 'Measure completed rentals and costs, not compliments.', text: 'Fine — but count the right things. Completed rentals, handling time, late returns, damage worries. Three friends saying “I’d try it” is a compliment, not demand.' },
      { speaker: 'judge', note: 'Plausible opportunity; demand and trust need evidence.', text: 'The opportunity is plausible and the risks are specific. Demand and trust are unproven, not disproven. The court directs a small, managed trial before anyone builds an app.' },
    ],
    rulings: {
      demand: 'Sustained. Stated interest is not demand. The record will count completed, paid rentals only.',
      alternative: 'Sustained in part. Friends and department loan desks are real alternatives — the trial must show why this is better.',
      risk: 'Noted. Responsibility for damage must be written down before the first item leaves the desk.',
    },
    verdict: {
      headline: 'Test the service. Then build the app.',
      summary: 'A promising, unproven opportunity. The court is persuaded there is a need, not yet that students will pay or that trust can be managed.',
      possibility: 'Students with occasional, high-cost needs may prefer renting nearby to buying.',
      risk: 'Damage, late returns and disputes could make each rental cost more than it earns.',
      experiment: 'Run a one-week, club-managed trial with a handful of items. Track requests, completed rentals, handling time and any disputes.',
      changeIf: ['Students pay for repeat rentals without reminders', 'Handling time per rental stays manageable for volunteers', 'A clear damage-and-deposit policy is accepted by both sides'],
    },
  },
  {
    id: 'meals', number: '015', title: 'Meal rescue', headline: 'A second chance for supper.',
    brief: 'Students reserve safe surplus meals from nearby cafés just before closing — cheaper food, less waste.',
    goal: 'A small neighbourhood trial',
    exhibits: [{ id: 'meals-1', kind: 'note', title: 'One café owner is open to a trial.', detail: 'Willingness is not yet a safe, working pickup process.', sample: true }],
    script: [
      { speaker: 'paksh', note: 'Surplus food meets price-sensitive students.', text: 'Good food is thrown away every night a few streets from students who skip dinner to save money. A reservation at closing time turns waste into an affordable meal — and gives cafés a small return on food already made.' },
      { speaker: 'vipaksh', note: 'Supply is unreliable; food safety is a hard prerequisite.', text: 'Surplus is unpredictable by definition. Some nights there is nothing; some nights it is all bread. And food safety is not optional — labelling, allergens, how long it has sat out. One bad meal ends the idea.' },
      { speaker: 'paksh', note: 'One café, a short pickup window, labelled boxes.', text: 'So promise less. One café, a short pickup window, clearly labelled boxes with allergens listed by the café. Students reserve, collect, done. No delivery, no app store — just a list and a time.' },
      { speaker: 'vipaksh', note: 'Track cancellations, no-shows and refunds.', text: 'Then plan for the bad nights too. What happens when a box sells out after someone reserves it, or nobody turns up? Track cancellations, refunds and no-shows, not just happy pickups.' },
      { speaker: 'judge', note: 'Clear social value; operations unproven. Safety first.', text: 'The social value is clear; the operations are not. Safety requirements come first, then a narrow trial. The court wants to see completed pickups and repeat use before anything grows.' },
    ],
    rulings: {
      demand: 'Sustained. A willing café shows supply, not student demand. The record will count collected meals.',
      alternative: 'Sustained. Existing surplus apps and closing-time discounts may already serve this — the trial should note why students choose this.',
      risk: 'Sustained. Safety labelling and allergen information are required before any meal is offered.',
    },
    verdict: {
      headline: 'One café. One careful trial.',
      summary: 'Worth testing, narrowly. The idea’s value is easy to see; whether it can run safely and reliably is not yet known.',
      possibility: 'Students may reliably buy discounted surplus if pickup is simple and predictable.',
      risk: 'Unpredictable supply and food-safety lapses could break trust quickly.',
      experiment: 'Offer a limited number of clearly labelled reservations with one café for two weeks. Measure pickups, food saved, cancellations and staff effort.',
      changeIf: ['Most reserved meals are actually collected', 'The café finds the effort worth the return', 'Students come back within the trial'],
    },
  },
  {
    id: 'swap', number: '016', title: 'Skill swap', headline: 'Your skill. Their next step.',
    brief: 'Students trade short skill sessions — design for coding, music for maths — and learn from each other.',
    goal: 'A student-community experiment',
    exhibits: [{ id: 'swap-1', kind: 'note', title: 'Two clubs will share the invitation.', detail: 'Reach is not the same as successful matches.', sample: true }],
    script: [
      { speaker: 'paksh', note: 'Untapped peer skills; swapping makes help feel equal.', text: 'Every campus is full of people who can teach something and want to learn something else. A swap removes the cost and makes asking for help feel equal. One good session can unlock a whole project.' },
      { speaker: 'vipaksh', note: 'Double matching is rare; demand is lopsided.', text: 'Swaps need two people who want exactly each other’s skills, at the same time. That double match is rare. Most people will want coding help; very few will want harmonium lessons in return.' },
      { speaker: 'paksh', note: 'Match by hand; allow one-way help.', text: 'Then don’t insist on a perfect swap. Match by hand through one club, and allow one-way help with a simple promise to pay it forward. People can spot good matches before an algorithm can.' },
      { speaker: 'vipaksh', note: 'Count completed sessions and feedback from both sides.', text: 'Sign-ups will look great and mean little. Count the sessions that actually happen, and ask both people whether it was useful. If helpers never come back, the model isn’t working.' },
      { speaker: 'judge', note: 'Real goodwill; the matching problem is real too.', text: 'There is goodwill here, but the matching problem is real. The court asks for a few hand-made matches and an honest look at which ones lasted.' },
    ],
    rulings: {
      demand: 'Sustained. Club reach shows distribution, not demand. The record will count completed sessions.',
      alternative: 'Sustained in part. Tutors, videos and senior mentors exist — the trial should show what a swap adds.',
      risk: 'Noted. Helper fatigue is a real risk; the trial must track whether helpers return.',
    },
    verdict: {
      headline: 'Make a few matches. Learn what sticks.',
      summary: 'Encouraging but unproven. Goodwill is likely; whether matches complete and repeat is the open question.',
      possibility: 'Students may value peer help enough to give time in return.',
      risk: 'Lopsided demand could leave helpers drained and learners waiting.',
      experiment: 'Ask each participant for one skill to offer and one goal. Match a small group by hand, then record completed sessions and feedback from both sides.',
      changeIf: ['Most matched pairs complete at least one session', 'Helpers say they would help again', 'Some pairs continue without prompting'],
    },
  },
  {
    id: 'print', number: '017', title: 'Print & collect', headline: 'Skip the queue. Grab your pages.',
    brief: 'Students upload documents from their phone, pay online, and collect printed pages from a library counter in a chosen time slot.',
    goal: 'Launch a semester service',
    exhibits: [
      { id: 'print-1', kind: 'note', title: 'Two-week manual pilot: 112 paid orders from 64 students.', detail: 'Run with a simple form and a shared inbox. Illustrative sample data.', sample: true },
      { id: 'print-2', kind: 'note', title: '41% of pilot users ordered again within the fortnight.', detail: 'Repeat orders came without reminders or discounts.', sample: true },
      { id: 'print-3', kind: 'note', title: 'The library agreed to host a pickup counter for one semester.', detail: 'Written approval; staff time capped at one hour a day.', sample: true },
    ],
    script: [
      { speaker: 'paksh', note: 'Paid, repeat demand already exists.', text: 'This isn’t a guess any more. In two weeks, sixty-four students paid for a hundred and twelve orders through nothing fancier than a form and an inbox. Four in ten came back on their own — and exam week will only make the copy-shop queue longer.' },
      { speaker: 'vipaksh', note: 'Pilot timing and novelty may inflate demand.', text: 'Two weeks is a short window, and it overlapped with assignment deadlines. Novelty and a deadline rush can flatter any pilot. And what happens when the printer jams at nine in the morning with forty orders waiting?' },
      { speaker: 'paksh', note: 'Library counter solves space and trust; unit costs are known.', text: 'The library counter gives us a trusted pickup point, and the printer is already theirs. We know the cost per page, the margin per order, and that one volunteer ran the pilot in under an hour a day. The operations are boring — that’s a good sign.' },
      { speaker: 'vipaksh', note: 'Concedes demand; remaining risks are operational.', text: 'Then I’ll concede the big question: the demand looks real. What’s left is operational — a backup when the printer fails, a clear refund rule, and limits so one volunteer isn’t buried in exam week. Those are things to plan for, not reasons to stop.' },
      { speaker: 'judge', note: 'Demand and economics evidenced; approved with a starter plan.', text: 'The evidence is behavioural, paid and repeated, and the challenger’s remaining concerns are operational. The court approves the idea, with a starter plan that guards against the risks raised today.' },
    ],
    rulings: {
      demand: 'Overruled. The record shows 112 paid orders and repeat use without reminders — that is behaviour, not praise.',
      alternative: 'Noted. The copy shop remains an alternative; track whether convenience keeps students choosing pickup over walking in.',
      risk: 'Sustained. Printer failure and refunds are real risks — the plan must include a backup printer and a written refund rule.',
    },
    verdict: {
      outcome: 'approved',
      headline: 'Approved. Start with one counter.',
      summary: 'Paid, repeated demand and known unit costs carry the case. The remaining risks are operational, so they belong in the launch plan rather than in another hearing.',
      possibility: 'A simple, trusted pickup point can win regular printing from students who want to skip the queue.',
      risk: 'Printer downtime or exam-week overload could break the convenience that makes this work.',
      experiment: 'Reach 150 paid orders in the first four weeks, with at least 95% collected on time.',
      changeIf: [
        'Repeat orders fall below 25% after the first month',
        'On-time pickup drops below 90% during exam week',
        'The library withdraws the counter, or staff time exceeds the agreed hour',
      ],
      plan: {
        title: 'Starter plan · first four weeks',
        steps: [
          { when: 'Week 1', title: 'Set up', detail: 'Move the pilot form to a simple order page with online payment. Publish prices and a written refund rule, and agree a backup printer with the department office.' },
          { when: 'Week 2', title: 'Soft launch', detail: 'Open to the two pilot clubs first, with four fixed pickup slots a day and a cap of 40 orders per slot.' },
          { when: 'Week 3', title: 'Open campus-wide', detail: 'Announce at the library entrance and in hostel groups. Keep one volunteer on the counter; add a second only if the cap is hit three days running.' },
          { when: 'Week 4', title: 'Review', detail: 'Compare orders, repeat rate, on-time pickups, refunds and volunteer hours against the milestone, then decide whether to open a second counter.' },
        ],
        budget: 'Starts small: payment-link fees, a paper buffer and printed signage (illustrative).',
        track: ['Paid orders per week', 'Repeat-order rate', 'On-time pickup rate', 'Refunds and failed prints', 'Volunteer hours per day'],
      },
    },
  },
];

export function buildCustomCase({ title, brief, goal }) {
  const t = (title || '').trim() || 'Your idea';
  return {
    id: 'custom', number: '018', title: t, headline: 'Your idea, on the record.', custom: true,
    brief: (brief || '').trim() || 'Describe the idea in a sentence.',
    goal: (goal || '').trim() || 'A clearer next step',
    exhibits: [{ id: 'custom-1', kind: 'note', title: 'No evidence filed yet.', detail: 'Add notes, links or files from the composer below.', sample: true }],
    script: [
      { speaker: 'paksh', note: 'Name the audience and how they cope today.', text: `Start with who this is for. If “${t}” solves a problem people already feel, the opportunity lies in how they cope today — and what they would gladly stop doing.` },
      { speaker: 'vipaksh', note: 'Define the behaviour that would prove demand.', text: 'Then name the behaviour that proves demand. Not likes or compliments — something people do, pay or give up. What exactly would we expect to see if this mattered?' },
      { speaker: 'paksh', note: 'Run the smallest manual version first.', text: 'Try the smallest manual version first. Serve a handful of people by hand, learn what they really value, and only then decide what to build.' },
      { speaker: 'vipaksh', note: 'Agree success in advance; record costs and failures.', text: 'Agree the pass mark before the test. Write down what success means, record the costs and the failures, and don’t move the goalposts afterwards.' },
      { speaker: 'judge', note: 'Workflow illustration — not a live review.', text: 'This hearing illustrates the workflow; it is not a live review of your idea. The court’s guidance: define demand, test small, and judge the result against what you said in advance.' },
    ],
    rulings: {
      demand: 'Sustained. Until a demand signal is defined, enthusiasm cannot count as evidence.',
      alternative: 'Sustained. List what people use today; the test must beat that, not nothing.',
      risk: 'Noted. Name the riskiest assumption and test it first.',
    },
    verdict: {
      headline: 'Define demand. Test small.',
      summary: 'An illustrative verdict for a custom brief. A live Vichaar Sabha review would weigh your actual evidence.',
      possibility: 'People may already feel this problem enough to change behaviour.',
      risk: 'Without a predefined signal, early enthusiasm can be mistaken for demand.',
      experiment: 'Serve a small group by hand for a week against a success threshold written down beforehand.',
      changeIf: ['The predefined demand signal appears', 'Cost per user stays acceptable', 'Users ask for it again, unprompted'],
    },
  };
}
