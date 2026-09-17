// Keep the fuller wording as context for future surfaces, but start the session
// at the former "tiny" level. The final argument is a sub-minute first move.
const step = (detail, text, tiny) => ({ detail, text, tiny });

export const cleanTask = (value) => value.trim().replace(/[.!?]+$/, '');

const taskPatterns = [
  {
    id: 'lawn',
    matches: (task) =>
      /(?:cut|mow|trim).*(?:grass|lawn)|(?:grass|lawn).*(?:cut|mow|trim)/i.test(task),
    steps: () => [
      step(
        'Check that the grass is dry enough to mow and that you have enough daylight.',
        'Look outside and decide only this: dry enough to mow now — yes or no?',
        'Look outside.'
      ),
      step(
        'Put on outdoor shoes, then take the mower to the starting edge of the lawn.',
        'Put on your outdoor shoes.',
        'Pick up your outdoor shoes.'
      ),
      step(
        'Check that the mower has power or fuel, then clear obstacles from the first section.',
        'Check only whether the mower has power or fuel.',
        'Look at the mower’s power indicator or fuel tank.'
      ),
      step(
        'Start with one narrow strip along the edge. Continue in parallel strips until the timebox ends or the lawn is done.',
        'Start the mower and cut one narrow strip.',
        'Move the mower to the starting edge.'
      ),
      step(
        'Switch off and store the mower, then put back anything you moved.',
        'Switch off the mower and put it somewhere safe.',
        'Switch off the mower.'
      )
    ]
  },
  {
    id: 'email',
    matches: (task) => /(?:email|e-mail|reply|respond|message)/i.test(task),
    steps: (task) => [
      step(
        'Open the message and read it once from top to bottom.',
        'Open the message. Do not reply yet.',
        'Open the message.'
      ),
      step(
        'Write one sentence stating the outcome you want from your reply.',
        'Write three words describing the outcome you want.',
        'Write one outcome word.'
      ),
      step(
        'Draft the shortest reply that gives the answer, decision or next action.',
        'Write only the first sentence of the reply.',
        'Type the first three words.'
      ),
      step(
        'Read the draft once for clarity, then send it or schedule when you will return.',
        'Check only that the recipient and main request are correct.',
        'Check the recipient.'
      )
    ]
  },
  {
    id: 'writing',
    matches: (task) => /(?:write|draft|report|proposal|document|update|memo|presentation|slides)/i.test(task),
    steps: (task) => [
      step(
        'Open the document and go to the exact section you need to change.',
        'Open the document.',
        'Find the document.'
      ),
      step(
        'Write three rough bullets covering the main point, evidence and next action.',
        'Write one rough bullet. It does not need to be polished.',
        'Type one word for the main point.'
      ),
      step(
        'Turn the strongest bullet into a plain first paragraph.',
        'Write one imperfect opening sentence.',
        'Type the first three words.'
      ),
      step(
        'Mark the next unfinished section before you stop, so returning is easy.',
        'Leave a short note saying what comes next.',
        'Write “Next:”.'
      )
    ]
  },
  {
    id: 'leaving',
    matches: (task) => /(?:leave the house|leaving|go out|get ready|head out|depart)/i.test(task),
    steps: () => [
      step(
        'Put your phone, keys and wallet or bag together beside the door.',
        'Find your keys and put them beside the door.',
        'Find your keys.'
      ),
      step(
        'Get dressed for the weather and the place you are going.',
        'Put on the next item of clothing you need.',
        'Pick up that item of clothing.'
      ),
      step(
        'Use the bathroom, take any medication you need and fill a water bottle.',
        'Do only the most time-sensitive one of these.',
        'Choose which one is most urgent.'
      ),
      step(
        'Put on shoes and coat, check the destination, then leave.',
        'Put on your shoes.',
        'Pick up your shoes.'
      )
    ]
  },
  {
    id: 'cleaning',
    matches: (task) => /(?:clean|tidy|declutter|organise|organize|sort|wash up|dishes)/i.test(task),
    steps: () => [
      step(
        'Choose one visible surface or one small area. Ignore the rest for now.',
        'Point to one surface you will work on.',
        'Choose one surface.'
      ),
      step(
        'Remove obvious rubbish, dishes and laundry from that area.',
        'Remove one piece of rubbish or one item that belongs elsewhere.',
        'Pick up one item.'
      ),
      step(
        'Put away five remaining items, one at a time.',
        'Put away one item.',
        'Pick up one item to put away.'
      ),
      step(
        'Stop when the area is usable, then put away the cleaning supplies.',
        'Make one clear space large enough for your hand.',
        'Clear one hand-sized spot.'
      )
    ]
  },
  {
    id: 'admin',
    matches: (task) => /(?:book|schedule|appointment|call|phone|pay|form|renew|cancel|register)/i.test(task),
    steps: (task) => [
      step(
        'Find the name, reference number or account details you are likely to need.',
        'Find just the name or account involved.',
        'Name the account involved.'
      ),
      step(
        'Open the correct website, form or phone contact.',
        'Open the website or contact page.',
        'Open your browser or phone.'
      ),
      step(
        'Complete the first required field or make the call.',
        'Fill in one field, or write the number you need to call.',
        'Open the first field or keypad.'
      ),
      step(
        'Save the confirmation or write down the next action before closing it.',
        'Take a screenshot or note the current status.',
        'Open the camera or Notes.'
      )
    ]
  }
];

export function classifyTask(task) {
  const cleaned = cleanTask(task);
  return taskPatterns.find((pattern) => pattern.matches(cleaned))?.id ?? 'general';
}

function prepPlan(task) {
  const cleaned = cleanTask(task);
  const matched = taskPatterns.find((pattern) => pattern.matches(cleaned));
  if (matched) return matched.steps(cleaned);

  return [
    step(
      'Decide what “done enough for this session” means for “' + cleaned + '”.',
      'Write five words describing what “done enough” looks like.',
      'Write “Done enough:”.'
    ),
    step(
      'Get only the first tool, document or material you need.',
      'Name the first thing you need, then get it.',
      'Name the first thing you need.'
    ),
    step(
      'Do one visible action that changes the task from not started to started.',
      'Work on it for two minutes, then decide whether to continue.',
      'Start a two-minute timer.'
    ),
    step(
      'Leave a short note about the next action before you stop.',
      'Write: “Next, I will…” and finish the sentence.',
      'Write “Next:”.'
    )
  ];
}

function prioritisePlan(task) {
  const items = task.split(/\n|,/).map(cleanTask).filter(Boolean);
  const first = items[0] || cleanTask(task);
  return [
    step(
      'Cross out anything that has no real consequence this week.',
      'Cross out one item that can wait.',
      'Choose one item to ignore today.'
    ),
    step(
      'Mark the item with the nearest real deadline or consequence.',
      'Circle the one item that becomes harder if you delay it.',
      'Point to the nearest deadline.'
    ),
    step(
      'Use “' + first + '” as the starting candidate, then replace it only if another item has a clearer consequence.',
      'Choose between the first two items only.',
      'Read the first two items.'
    ),
    step(
      'Define one action on the chosen item that fits inside this timebox.',
      'Write one action that takes less than five minutes.',
      'Write one action verb.'
    )
  ];
}

function planningPlan(task) {
  const cleaned = cleanTask(task);
  return [
    step(
      'Write one sentence describing the useful outcome of “' + cleaned + '”.',
      'Write five words describing the outcome.',
      'Write one outcome word.'
    ),
    step(
      'Name the first hard constraint: time, money, information, energy or another person.',
      'Choose only one constraint.',
      'Name one constraint.'
    ),
    step(
      'Make the one decision that removes the most uncertainty.',
      'Write two possible choices, then circle one.',
      'Write “A:” and one choice.'
    ),
    step(
      'Turn that decision into a physical next action and put it where you will see it.',
      'Write: “Next, I will…” and finish the sentence.',
      'Write “Next:”.'
    )
  ];
}

export function createPlan(mode, task) {
  if (mode === 'prioritise') return prioritisePlan(task);
  if (mode === 'plan') return planningPlan(task);
  return prepPlan(task);
}
