/**
 * Manages the live rolling transcript panel during the interview.
 */

export class TranscriptPanel {
  constructor(panelEl, innerEl, toggleBtn, toggleLabelEl) {
    this.panel = panelEl;
    this.inner = innerEl;
    this.toggleBtn = toggleBtn;
    this.toggleLabel = toggleLabelEl;
    this.isOpen = false;
    this.turns = [];

    toggleBtn.addEventListener('click', () => this.toggle());
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.panel.classList.toggle('open', this.isOpen);
    this.toggleLabel.textContent = this.isOpen ? 'Hide Transcript' : 'Show Transcript';
    if (this.isOpen) this.scrollToBottom();
  }

  open() {
    if (!this.isOpen) this.toggle();
  }

  addTurn(source, text, witnessName = 'Witness') {
    // Remove the empty placeholder if present
    const empty = this.inner.querySelector('.transcript-empty');
    if (empty) empty.remove();

    const turn = document.createElement('div');
    turn.className = `turn turn-${source}`; // turn-student | turn-witness

    const label = document.createElement('span');
    label.className = 'turn-label';
    label.textContent = source === 'student' ? 'You' : witnessName;

    const textEl = document.createElement('p');
    textEl.className = 'turn-text';
    textEl.textContent = text;

    turn.appendChild(label);
    turn.appendChild(textEl);
    this.inner.appendChild(turn);

    this.turns.push({ source, text });

    if (this.isOpen) {
      requestAnimationFrame(() => this.scrollToBottom());
    }
  }

  scrollToBottom() {
    this.panel.scrollTop = this.panel.scrollHeight;
  }

  getTurns() {
    return this.turns;
  }

  clear() {
    this.turns = [];
    this.inner.innerHTML = '<div class="transcript-empty">Transcript will appear here as the interview progresses...</div>';
    if (this.isOpen) this.toggle();
  }
}
