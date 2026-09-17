# Contributing

Thank you for helping make Phasr calmer, clearer and more useful.

## Good contributions

- synthetic scenarios that expose a confusing or brittle interaction;
- accessibility improvements for keyboard, screen-reader, motion or contrast;
- language improvements grounded in lived experience;
- small, testable changes to the state machine or storage boundaries;
- adapters that preserve local-first defaults.

## Development

~~~bash
npm install
npm run check
npm test
npm run build
~~~

Add tests for state-machine changes. A useful behavioural test describes the
starting situation, the interruption or difficulty, and the recovery path.

## Privacy rule

Do not submit real session logs, private task lists, health information,
credentials, local absolute paths, or data copied from another person. Create a
small synthetic reproduction instead.

## Language

Write for people rather than diagnoses. Avoid claims that Phasr treats or cures
a condition. Prefer concrete descriptions of what an interaction helps someone
do.
