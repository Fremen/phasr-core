import { cleanTask, createPlan } from './planner.js';
import { createAIPlan } from './ai-planner.js';

(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const setup = $('#setup-form');
  const sessionView = $('#session');
  const completeView = $('#complete');
  const taskInput = $('#task');
  const clock = $('#clock');
  const progress = $('#progress');
  const stepCount = $('#step-count');
  const currentStep = $('#current-step');
  const supportCopy = $('#support-copy');
  const returnPanel = $('#return-panel');
  const sessionActions = $('.session-actions');
  const submitButton = setup.querySelector('button[type="submit"]');
  const submitLabel = submitButton.innerHTML;

  let state = null;
  let ticker = null;

  const labels = {
    prep: 'START SESSION',
    prioritise: 'CHOOSE SESSION',
    plan: 'PLAN SESSION'
  };

  function show(view) {
    [setup, sessionView, completeView].forEach((element) => {
      element.hidden = element !== view;
    });
    view.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderStep() {
    const total = state.steps.length;
    stepCount.textContent = 'STEP ' + (state.index + 1) + ' OF ' + total;
    currentStep.textContent = state.steps[state.index].text;
    supportCopy.textContent = state.smaller
      ? 'Two minutes is enough. Stop there if you need to.'
      : 'You only need to do this step.';
    currentStep.focus({ preventScroll: true });
  }

  function renderTime() {
    if (!state) return;
    const remaining = Math.max(0, state.endsAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const minutesPart = Math.floor(seconds / 60);
    const secondsPart = seconds % 60;
    clock.textContent = String(minutesPart).padStart(2, '0') + ':' + String(secondsPart).padStart(2, '0');
    progress.style.transform = 'scaleX(' + (remaining / state.durationMs) + ')';
    if (remaining === 0) {
      $('#time-copy').textContent = 'timebox complete';
      window.clearInterval(ticker);
    }
  }

  async function startSession(event) {
    event.preventDefault();
    const task = cleanTask(taskInput.value);
    if (!task) {
      taskInput.focus();
      return;
    }
    const mode = new FormData(setup).get('mode');
    const minutes = Number($('#timebox').value);
    const durationMs = minutes * 60 * 1000;
    const useAI = $('#use-ai').checked;
    let steps;
    let source = 'On-device planner';

    submitButton.disabled = true;
    submitButton.textContent = useAI ? 'Building your AI plan…' : 'Building your plan…';
    $('#planner-error').hidden = true;

    if (useAI) {
      try {
        const chat = (prompt) => window.puter.ai.chat(prompt);
        steps = await createAIPlan(task, mode, minutes, chat);
        source = 'AI plan via Puter · review each step before acting';
      } catch (error) {
        steps = createPlan(mode, task);
        source = 'AI unavailable · using the on-device planner';
        $('#planner-error').textContent =
          'AI was unavailable, so Phasr made a local plan instead.';
        $('#planner-error').hidden = false;
      }
    } else {
      steps = createPlan(mode, task);
    }

    submitButton.disabled = false;
    submitButton.innerHTML = submitLabel;
    state = {
      task,
      mode,
      steps,
      index: 0,
      completed: 0,
      smaller: false,
      durationMs,
      endsAt: Date.now() + durationMs,
      pausedAt: null
    };
    $('#mode-label').textContent = labels[mode];
    $('#plan-source').textContent = source;
    $('#time-copy').textContent = 'available';
    returnPanel.hidden = true;
    sessionActions.hidden = false;
    renderStep();
    renderTime();
    window.clearInterval(ticker);
    ticker = window.setInterval(renderTime, 1000);
    show(sessionView);
  }

  function finish() {
    window.clearInterval(ticker);
    $('#completion-copy').textContent =
      'You completed ' + state.completed + ' small step' + (state.completed === 1 ? '' : 's') +
      ' toward “' + state.task + '”. That counts.';
    show(completeView);
  }

  setup.addEventListener('submit', startSession);

  document.querySelectorAll('[data-example]').forEach((button) => {
    button.addEventListener('click', () => {
      taskInput.value = button.dataset.example;
      taskInput.focus();
    });
  });

  $('#done').addEventListener('click', () => {
    state.completed += 1;
    state.index += 1;
    state.smaller = false;
    if (state.index >= state.steps.length) {
      finish();
    } else {
      renderStep();
    }
  });

  $('#smaller').addEventListener('click', () => {
    if (state.smaller) return;
    state.steps[state.index].text = state.steps[state.index].tiny;
    state.smaller = true;
    renderStep();
  });

  $('#pause').addEventListener('click', () => {
    state.pausedAt = Date.now();
    window.clearInterval(ticker);
    sessionActions.hidden = true;
    returnPanel.hidden = false;
    supportCopy.textContent = 'Paused. Your place is safe.';
  });

  $('#resume').addEventListener('click', () => {
    const pausedFor = Date.now() - state.pausedAt;
    state.endsAt += pausedFor;
    state.pausedAt = null;
    returnPanel.hidden = true;
    sessionActions.hidden = false;
    supportCopy.textContent = 'Welcome back. Continue from here.';
    renderTime();
    ticker = window.setInterval(renderTime, 1000);
    currentStep.focus({ preventScroll: true });
  });

  function reset() {
    window.clearInterval(ticker);
    state = null;
    taskInput.value = '';
    show(setup);
    taskInput.focus({ preventScroll: true });
  }

  $('#reset').addEventListener('click', reset);
  $('#again').addEventListener('click', reset);
})();
