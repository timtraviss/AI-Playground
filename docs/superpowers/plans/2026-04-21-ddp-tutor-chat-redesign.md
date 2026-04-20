# DDP Tutor Chat UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the DDP Tutor chat page to use a centred 700px column, remove avatars, strip the assistant bubble, and add a proper voice mode footer with waveform feedback.

**Architecture:** All changes are confined to `public/tutor/index.html` — CSS updates, HTML structural changes (inner wrapper divs), and minor JS DOM changes. No backend changes, no new dependencies.

**Tech Stack:** Vanilla HTML/CSS/JS. Existing `marked` + `DOMPurify` CDN scripts stay. No new libraries.

---

## File Map

| Action | Path | What changes |
|---|---|---|
| Modify | `public/tutor/index.html` | CSS, HTML structure, JS DOM helpers |

---

## Task 1: Centred layout, remove avatars, strip assistant bubble

**Files:**
- Modify: `public/tutor/index.html`

This task covers: adding the `.chat-inner` 700px column, wrapping header/messages/footer content, removing avatars from JS, stripping the assistant bubble background, and updating the replay button style.

- [ ] **Step 1: Replace the CSS block (lines 61–181)**

Replace everything from `/* ── Chat screen ── */` through the closing `}` of `.voice-unsupported` with this:

```css
    /* ── Chat screen ── */
    .chat-screen {
      display: flex; flex-direction: column;
      height: calc(100vh - 52px);
    }
    .chat-inner { max-width: 700px; margin: 0 auto; width: 100%; }
    .chat-header {
      padding: 16px 24px; border-bottom: 1px solid #21262d; flex-shrink: 0;
    }
    .chat-header .chat-inner {
      display: flex; align-items: center; justify-content: space-between;
    }
    .chat-module-name { font-size: 14px; font-weight: 600; color: #e8c96a; }
    .chat-actions { display: flex; align-items: center; gap: 12px; }
    .mode-toggle {
      display: flex; background: #161b22; border: 1px solid #21262d;
      border-radius: 8px; overflow: hidden;
    }
    .mode-btn {
      padding: 6px 14px; font-size: 13px; font-weight: 500;
      background: none; border: none; color: #64748b;
      cursor: pointer; transition: all 0.15s;
    }
    .mode-btn.active { background: #e8c96a; color: #0d1117; font-weight: 700; }
    .mode-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-new {
      padding: 6px 14px; font-size: 13px; font-weight: 600;
      background: transparent; border: 1px solid #21262d; border-radius: 8px;
      color: #94a3b8; cursor: pointer; transition: border-color 0.15s;
    }
    .btn-new:hover { border-color: #e8c96a; color: #e2e8f0; }

    .chat-messages {
      flex: 1; overflow-y: auto; padding: 28px 24px;
    }
    .chat-messages .chat-inner {
      display: flex; flex-direction: column; gap: 20px;
    }
    .message { display: flex; gap: 12px; }
    .message.user { flex-direction: row-reverse; align-self: flex-end; max-width: 75%; }
    .message.assistant { align-self: flex-start; width: 100%; }
    .bubble {
      font-size: 15px; line-height: 1.75;
    }
    .message.user .bubble {
      background: #e8c96a; color: #0d1117; border-radius: 18px 18px 4px 18px;
      padding: 10px 15px; font-weight: 500;
    }
    .message.assistant .bubble {
      padding: 0; background: none; border: none; border-radius: 0;
    }
    .message.assistant .bubble p { margin: 0 0 10px; }
    .message.assistant .bubble p:last-child { margin-bottom: 0; }
    .message.assistant .bubble ul, .message.assistant .bubble ol { margin: 0 0 10px; padding-left: 20px; }
    .message.assistant .bubble li { margin-bottom: 4px; }
    .message.assistant .bubble strong { color: #e8c96a; }
    .message.assistant .bubble h1, .message.assistant .bubble h2, .message.assistant .bubble h3 {
      color: #e2e8f0; margin: 12px 0 6px; font-size: 15px;
    }
    .message.assistant .bubble blockquote {
      border-left: 3px solid #e8c96a; margin: 8px 0; padding-left: 12px; color: #94a3b8;
    }
    .message.assistant .bubble code {
      background: #161b22; border-radius: 4px; padding: 2px 5px; font-size: 13px;
    }
    .replay-btn {
      background: none; border: none; color: #64748b;
      cursor: pointer; padding: 0; font-size: 12px;
      margin-top: 6px; display: none;
    }
    .replay-btn:hover { color: #e8c96a; }
    .replay-btn.visible { display: inline-block; }

    .chat-footer {
      padding: 16px 24px; border-top: 1px solid #21262d; flex-shrink: 0;
    }
    .input-row { display: flex; gap: 10px; align-items: flex-end; }
    textarea#user-input {
      flex: 1; background: #161b22; border: 1px solid #21262d;
      border-radius: 12px; color: #e2e8f0; font-family: inherit;
      font-size: 15px; line-height: 1.5; padding: 12px 16px;
      resize: none; min-height: 48px; max-height: 160px;
      transition: border-color 0.15s;
    }
    textarea#user-input:focus { outline: none; border-color: #e8c96a; }
    .btn-send {
      background: #e8c96a; color: #0d1117; border: none;
      border-radius: 12px; width: 48px; height: 48px;
      font-size: 20px; cursor: pointer; flex-shrink: 0;
      transition: opacity 0.15s; display: flex; align-items: center; justify-content: center;
    }
    .btn-send:hover { opacity: 0.88; }
    .btn-send:disabled { opacity: 0.4; cursor: not-allowed; }
    .mic-btn {
      background: #161b22; border: 1px solid #21262d;
      border-radius: 12px; width: 48px; height: 48px;
      font-size: 20px; cursor: pointer; flex-shrink: 0;
      display: none; align-items: center; justify-content: center;
      transition: all 0.15s; color: #94a3b8;
    }
    .mic-btn.visible { display: flex; }
    .mic-btn.listening { background: rgba(248,113,113,0.15); border-color: #f87171; color: #f87171; }

    .typing-indicator { display: flex; gap: 4px; padding: 4px 0; }
    .typing-dot {
      width: 8px; height: 8px; background: #64748b; border-radius: 50%;
      animation: bounce 1.2s infinite;
    }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }
    .voice-unsupported {
      font-size: 12px; color: #64748b; text-align: center; margin-top: 8px; display: none;
    }
```

- [ ] **Step 2: Replace the chat screen HTML (lines 221–246)**

Replace the entire `<!-- ── Chat screen ── -->` block with:

```html
  <!-- ── Chat screen ── -->
  <div class="screen chat-screen" id="chat-screen" hidden>
    <div class="chat-header">
      <div class="chat-inner">
        <span class="chat-module-name" id="chat-module-name"></span>
        <div class="chat-actions">
          <div class="mode-toggle" id="mode-toggle">
            <button class="mode-btn active" id="btn-text-mode" title="Text mode">✏️ Text</button>
            <button class="mode-btn" id="btn-voice-mode" title="Voice mode">🎤 Voice</button>
          </div>
          <button class="btn-new" id="btn-new-session">New Session</button>
        </div>
      </div>
    </div>

    <div class="chat-messages" id="chat-messages">
      <div class="chat-inner" id="chat-inner"></div>
    </div>

    <div class="chat-footer">
      <div class="chat-inner">
        <div class="input-row">
          <textarea id="user-input" rows="1" placeholder="Ask a question about this module…"></textarea>
          <button class="btn-send" id="btn-send" title="Send">➤</button>
          <button class="mic-btn" id="mic-btn" title="Tap to speak">🎤</button>
        </div>
        <div class="voice-unsupported" id="voice-unsupported">
          Voice input is not supported in this browser. Use Chrome or Edge.
        </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Add `chatInner` element reference and fix `chatMessages.innerHTML` resets**

In the `// ── Elements ─────────────────────────────────────────` block, after `const chatMessages = document.getElementById('chat-messages');`, add:

```js
    const chatInner      = document.getElementById('chat-inner');
```

Then in the `btnStart` listener, change:
```js
      chatMessages.innerHTML = '';
```
to:
```js
      chatInner.innerHTML = '';
```

And in the `btnNewSession` listener, change:
```js
      chatMessages.innerHTML = '';
```
to:
```js
      chatInner.innerHTML = '';
```

- [ ] **Step 4: Remove avatars from `appendMessage()` and update append target**

Replace the entire `appendMessage` function:

```js
    function appendMessage(role, text) {
      const wrapper = document.createElement('div');
      wrapper.className = `message ${role}`;

      const col = document.createElement('div');
      col.style.display = 'flex';
      col.style.flexDirection = 'column';

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      if (role === 'assistant') {
        bubble.innerHTML = DOMPurify.sanitize(marked.parse(text));
      } else {
        bubble.textContent = text;
      }
      col.appendChild(bubble);

      if (role === 'assistant') {
        const replay = document.createElement('button');
        replay.className = 'replay-btn';
        replay.title = 'Replay audio';
        replay.textContent = '🔊 Replay';
        replay.addEventListener('click', () => {
          const idx = parseInt(replay.dataset.index, 10);
          if (audioCache.has(idx)) {
            playAudio(audioCache.get(idx));
          } else if (replay.dataset.text) {
            fetchAndPlayTts(replay.dataset.text, idx);
          }
        });
        col.appendChild(replay);
      }

      wrapper.appendChild(col);
      chatInner.appendChild(wrapper);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      return bubble;
    }
```

- [ ] **Step 5: Remove avatar from `appendTyping()` and update append target**

Replace the entire `appendTyping` function:

```js
    function appendTyping() {
      const wrapper = document.createElement('div');
      wrapper.className = 'message assistant';
      wrapper.innerHTML = `
        <div class="bubble">
          <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
        </div>`;
      chatInner.appendChild(wrapper);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      return wrapper;
    }
```

- [ ] **Step 6: Manual visual test**

```bash
# Server should already be running with --watch. If not:
cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground" && npm run dev
```

Visit `http://localhost:3000/tutor/` and verify:

1. Setup screen looks unchanged
2. Start a session — chat area opens with centred column (not full width)
3. Send a message — user bubble is gold pill, right-aligned, no avatar
4. Tutor response appears as clean text, left-aligned, no dark bubble, no avatar
5. Bold terms in tutor response are gold
6. Typing indicator (bouncing dots) shows while waiting
7. On a wide screen, content stays centred with space either side

- [ ] **Step 7: Commit**

```bash
cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground"
git add public/tutor/index.html
git commit -m "feat: centred 700px chat column, remove avatars, strip assistant bubble"
```

---

## Task 2: Voice mode footer — placeholder + waveform

**Files:**
- Modify: `public/tutor/index.html`

This task adds the voice idle/listening footer UI: a placeholder input area that says "Tap the mic to speak" when idle, and shows animated red waveform bars when listening.

- [ ] **Step 1: Add voice placeholder CSS**

Inside the `<style>` block, after the `.voice-unsupported` rule, add:

```css
    .voice-placeholder {
      flex: 1; background: #161b22; border: 1px solid #21262d;
      border-radius: 12px; min-height: 48px; padding: 0 16px;
      display: none; align-items: center; justify-content: center; gap: 8px;
    }
    .voice-placeholder.visible { display: flex; }
    .voice-placeholder.listening { border-color: #f87171; }
    .voice-placeholder-text { color: #64748b; font-size: 14px; }
    .voice-placeholder.listening .voice-placeholder-text { display: none; }
    .waveform { display: none; gap: 3px; align-items: center; height: 24px; }
    .voice-placeholder.listening .waveform { display: flex; }
    .waveform-bar {
      width: 3px; height: 6px; background: #f87171; border-radius: 2px;
      animation: wave 0.8s ease-in-out infinite;
    }
    .waveform-bar:nth-child(1) { animation-delay: 0s; }
    .waveform-bar:nth-child(2) { animation-delay: 0.1s; }
    .waveform-bar:nth-child(3) { animation-delay: 0.2s; }
    .waveform-bar:nth-child(4) { animation-delay: 0.1s; }
    .waveform-bar:nth-child(5) { animation-delay: 0s; }
    @keyframes wave {
      0%, 100% { height: 6px; }
      50% { height: 22px; }
    }
```

- [ ] **Step 2: Add voice placeholder HTML to the input row**

In the chat footer `.input-row`, after the `<button class="mic-btn" ...>` line, add:

```html
          <div class="voice-placeholder" id="voice-placeholder">
            <div class="waveform">
              <div class="waveform-bar"></div>
              <div class="waveform-bar"></div>
              <div class="waveform-bar"></div>
              <div class="waveform-bar"></div>
              <div class="waveform-bar"></div>
            </div>
            <span class="voice-placeholder-text">Tap the mic to speak</span>
          </div>
```

- [ ] **Step 3: Add `voicePlaceholder` element reference**

In the `// ── Elements ─────────────────────────────────────────` block, after the `voiceUnsupported` line, add:

```js
    const voicePlaceholder = document.getElementById('voice-placeholder');
```

- [ ] **Step 4: Update mic recognition handlers to sync waveform state**

Replace the three recognition event handlers:

```js
      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        micBtn.classList.remove('listening');
        voicePlaceholder.classList.remove('listening');
        sendMessage(transcript);
      };

      recognition.onerror = (e) => {
        micBtn.classList.remove('listening');
        voicePlaceholder.classList.remove('listening');
        const msg = e.error === 'not-allowed'
          ? 'Microphone access denied. Allow microphone permission in your browser settings.'
          : e.error === 'network'
          ? 'Speech recognition requires an internet connection.'
          : `Speech recognition error: ${e.error}. Try Chrome or Edge.`;
        voiceUnsupported.textContent = msg;
        voiceUnsupported.style.display = 'block';
      };
      recognition.onend = () => {
        micBtn.classList.remove('listening');
        voicePlaceholder.classList.remove('listening');
      };
```

- [ ] **Step 5: Update mic click handler to toggle waveform**

Replace the `micBtn.addEventListener('click', ...)` block:

```js
      micBtn.addEventListener('click', () => {
        if (isStreaming) return;
        if (micBtn.classList.contains('listening')) {
          recognition.stop();
          micBtn.classList.remove('listening');
          voicePlaceholder.classList.remove('listening');
        } else {
          voiceUnsupported.style.display = 'none';
          recognition.start();
          micBtn.classList.add('listening');
          voicePlaceholder.classList.add('listening');
        }
      });
```

- [ ] **Step 6: Update `btnTextMode` handler**

Replace the `btnTextMode.addEventListener('click', ...)` block:

```js
    btnTextMode.addEventListener('click', () => {
      voiceMode = false;
      btnTextMode.classList.add('active');
      btnVoiceMode.classList.remove('active');
      userInput.style.display = '';
      btnSend.style.display = '';
      if (SpeechRecognition) micBtn.style.display = 'none';
      voicePlaceholder.classList.remove('visible');
      voicePlaceholder.classList.remove('listening');
      voiceUnsupported.style.display = 'none';
    });
```

- [ ] **Step 7: Update `btnVoiceMode` handler**

Replace the `btnVoiceMode.addEventListener('click', ...)` block:

```js
    btnVoiceMode.addEventListener('click', () => {
      if (!SpeechRecognition) {
        voiceUnsupported.style.display = 'block';
        return;
      }
      voiceMode = true;
      btnVoiceMode.classList.add('active');
      btnTextMode.classList.remove('active');
      userInput.style.display = 'none';
      btnSend.style.display = 'none';
      micBtn.style.display = 'flex';
      voicePlaceholder.classList.add('visible');
    });
```

- [ ] **Step 8: Fix focus in voice mode**

In the `sendMessage` function, in the `finally` block, replace:

```js
        userInput.focus();
```

with:

```js
        if (!voiceMode) userInput.focus();
```

- [ ] **Step 9: Manual visual test**

Visit `http://localhost:3000/tutor/`, start a session, then:

1. Click "🎤 Voice" toggle — textarea and send button disappear, voice placeholder appears with "Tap the mic to speak" text
2. Click the mic button — placeholder border turns red, waveform bars animate, mic button turns red
3. Click mic button again to stop — bars disappear, placeholder returns to idle state
4. Click "✏️ Text" — voice placeholder disappears, textarea and send button return
5. Switch to voice, send a voice message — after response streams in, confirm focus doesn't jump to hidden textarea

- [ ] **Step 10: Commit**

```bash
cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground"
git add public/tutor/index.html
git commit -m "feat: voice mode footer with waveform listening indicator"
```

---

## Self-Review

| Spec requirement | Covered by |
|---|---|
| Centred 700px column | Task 1 — `.chat-inner` wrapper |
| Header content constrained to 700px | Task 1 — `.chat-header .chat-inner` |
| Footer content constrained to 700px | Task 1 — `.chat-footer .chat-inner` |
| Assistant messages — no bubble | Task 1 — `.message.assistant .bubble` stripped |
| User messages — gold pill, no avatar | Task 1 — bubble CSS + avatar removed from DOM |
| Remove all avatars | Task 1 — `appendMessage()` and `appendTyping()` |
| Typing indicator — no bubble wrapper | Task 1 — `appendTyping()` removes avatar, bubble has no bg |
| Voice idle: placeholder + mic button | Task 2 — `.voice-placeholder` HTML + CSS |
| Voice listening: waveform bars + red border | Task 2 — `.waveform-bar` CSS + `.listening` toggle |
| Replay button inline below assistant text | Task 1 — `.replay-btn` CSS, `margin-top: 6px` |
