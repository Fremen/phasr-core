const step = (text, tiny) => ({ text, tiny });

export const cleanTask = (value) => value.trim().replace(/[.!?]+$/, '');

const taskPatterns = [
  {
    id: 'lawn',
    matches: (task) =>
      /(?:cut|mow|trim).*(?:grass|lawn)|(?:grass|lawn).*(?:cut|mow|trim)/i.test(task),
    steps: () => [
      step(
        'Check that the grass is dry enough to mow and that you have enough daylight.',
        'Look outside and decide only this: dry enough to mow now — yes or no?'
      ),
      step(
        'Put on outdoor shoes, then take the mower to the starting edge of the lawn.',
        'Put on your outdoor shoes.'
      ),
      step(
        'Check that the mower has power or fuel, then clear obstacles from the first section.',
        'Check only whether the mower has power or fuel.'
      ),
      step(
        'Start with one narrow strip along the edge. Continue in parallel strips until the timebox ends or the lawn is done.',
        'Start the mower and cut one narrow strip.'
      ),
      step(
        'Switch off and store the mower, then put back anything you moved.',
        'Switch off the mower and put it somewhere safe.'
      )
    ]
  },
  {
    id: 'email',
    matches: (task) => /(?:email|e-mail|reply|respond|message)/i.test(task),
    steps: (task) => [
      step(
        'Open the message and read it once from top to bottom.',
        'Open the message. Do not reply yet.'
      ),
      step(
        'Write one sentence stating the outcome you want from your reply.',
        'Write three words describing the outcome you want.'
      ),
      step(
        'Draft the shortest reply that gives the answer, decision or next action.',
        'Write only the first sentence of the reply.'
      ),
      step(
        'Read the draft once for clarity, then send it or schedule when you will return.',
        'Check only that the recipient and main request are correct.'
      )
    ]
  },
  {
    id: 'writing',
    matches: (task) => /(?:write|draft|report|proposal|document|update|memo|presentation|slides)/i.test(task),
    steps: (task) => [
      step(
        'Open the document and go to the exact section you need to change.',
        'Open the document.'
      ),
      step(
        'Write three rough bullets covering the main point, evidence and next action.',
        'Write one rough bullet. It does not need to be polished.'
      ),
      step(
        'Turn the strongest bullet into a plain first paragraph.',
        'Write one imperfect opening sentence.'
      ),
      step(
        'Mark the next unfinished section before you stop, so returning is easy.',
        'Leave a short note saying what comes next.'
      )
    ]
  },
  {
    id: 'leaving',
    matches: (task) => /(?:leave the house|leaving|go out|get ready|head out|depart)/i.test(task),
    steps: () => [
      step(
        'Put your phone, keys and wallet or bag together beside the door.',
        'Find your keys and put them beside the door.'
      ),
      step(
        'Get dressed for the weather and the place you are going.',
        'Put on the next item of clothing you need.'
      ),
      step(
        'Use the bathroom, take any medication you need and fill a water bottle.',
        'Do only the most time-sensitive one of these.'
      ),
      step(
        'Put on shoes and coat, check the destination, then leave.',
        'Put on your shoes.'
      )
    ]
  },
  {
    id: 'cleaning',
    matches: (task) => /(?:clean|tidy|declutter|organise|organize|sort|wash up|dishes)/i.test(task),
    steps: () => [
      step(
        'Choose one visible surface or one small area. Ignore the rest for now.',
        'Point to one surface you will work on.'
      ),
      step(
        'Remove obvious rubbish, dishes and laundry from that area.',
        'Remove one piece of rubbish or one item that belongs elsewhere.'
      ),
      step(
        'Put away five remaining items, one at a time.',
        'Put away one item.'
      ),
      step(
        'Stop when the area is usable, then put away the cleaning supplies.',
        'Make one clear space large enough for your hand.'
      )
    ]
  },
  {
    id: 'admin',
    matches: (task) => /(?:book|schedule|appointment|call|phone|pay|form|renew|cancel|register)/i.test(task),
    steps: (task) => [
      step(
        'Find the name, reference number or account details you are likely to need.',
        'Find just the name or account involved.'
      ),
      step(
        'Open the correct website, form or phone contact.',
        'Open the website or contact page.'
      ),
      step(
        'Complete the first required field or make the call.',
        'Fill in one field, or write the number you need to call.'
      ),
      step(
        'Save the confirmation or write down the next action before closing it.',
        'Take a screenshot or note the current status.'
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
      'Write five words describing what “done enough” looks like.'
    ),
    step(
      'Get only the first tool, document or material you need.',
      'Name the first thing you need, then get it.'
    ),
    step(
      'Do one visible action that changes the task from not started to started.',
      'Work on it for two minutes, then decide whether to continue.'
    ),
    step(
      'Leave a short note about the next action before you stop.',
      'Write: “Next, I will…” and finish the sentence.'
    )
  ];
}

function prioritisePlan(task) {
  const items = task.split(/\n|,/).map(cleanTask).filter(Boolean);
  const first = items[0] || cleanTask(task);
  return [
    step(
      'Cross out anything that has no real consequence this week.',
      'Cross out one item that can wait.'
    ),
    step(
      'Mark the item with the nearest real deadline or consequence.',
      'Circle the one item that becomes harder if you delay it.'
    ),
    step(
      'Use “' + first + '” as the starting candidate, then replace it only if another item has a clearer consequence.',
      'Choose between the first two items only.'
    ),
    step(
      'Define one action on the chosen item that fits inside this timebox.',
      'Write one action that takes less than five minutes.'
    )
  ];
}

function planningPlan(task) {
  const cleaned = cleanTask(task);
  return [
    step(
      'Write one sentence describing the useful outcome of “' + cleaned + '”.',
      'Write five words describing the outcome.'
    ),
    step(
      'Name the first hard constraint: time, money, information, energy or another person.',
      'Choose only one constraint.'
    ),
    step(
      'Make the one decision that removes the most uncertainty.',
      'Write two possible choices, then circle one.'
    ),
    step(
      'Turn that decision into a physical next action and put it where you will see it.',
      'Write: “Next, I will…” and finish the sentence.'
    )
  ];
}

export function createPlan(mode, task) {
  if (mode === 'prioritise') return prioritisePlan(task);
  if (mode === 'plan') return planningPlan(task);
  return prepPlan(task);
}
