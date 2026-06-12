/* ═══════════════════════════════════════════
   VoiceFirst Mobile — app.js
   ═══════════════════════════════════════════ */

// ── DOM ────────────────────────────────────
const $ = id => document.getElementById(id);

const chatArea          = $('chatArea');
const welcomeState      = $('welcomeState');
const messages          = $('messages');
const msgInput          = $('msgInput');
const sendBtn           = $('sendBtn');
const voiceBtn          = $('voiceBtn');
const audioFileInput    = $('audioFileInput');
const backdrop          = $('backdrop');

// Sheets
const voiceSheet        = $('voiceSheet');
const recordingSheet    = $('recordingSheet');
const uploadSheet       = $('uploadSheet');

// Recording sheet internals
const recDot            = $('recDot');
const recLabel          = $('recLabel');
const recClose          = $('recClose');
const recCancel         = $('recCancel');
const recSend           = $('recSend');
const waveform          = $('waveform');
const transcriptBox     = $('transcriptBox');
const transcriptFinal   = $('transcriptFinal');
const transcriptInterim = $('transcriptInterim');
const transcriptPlaceholder = $('transcriptPlaceholder');

// Upload sheet internals
const uploadFileName    = $('uploadFileName');
const uploadProgressBar = $('uploadProgressBar');
const uploadStatus      = $('uploadStatus');
const uploadOrb         = $('uploadOrb');
const uploadCancel      = $('uploadCancel');

// Voice option buttons
const optionSpeak       = $('optionSpeak');
const optionUpload      = $('optionUpload');
const sheetCancel       = $('sheetCancel');

// ── State ──────────────────────────────────
const state = {
  recognition: null,
  isListening: false,
  finalTranscript: '',
  interimTranscript: '',
  pendingTranscript: null,
  pendingType: null,       // 'voice' | 'audio'
  isTyping: false,
  demoTimer: null,
};

// ── Status clock ───────────────────────────
function updateClock() {
  const el = $('statusTime');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
updateClock();
setInterval(updateClock, 30000);

// ── Auto-resize textarea ───────────────────
msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
});
msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});
sendBtn.addEventListener('click', handleSend);

// ── Sheet helpers ──────────────────────────
function openSheet(sheet) {
  closeAllSheets();
  backdrop.classList.add('show');
  sheet.classList.add('open');
}
function closeAllSheets() {
  backdrop.classList.remove('show');
  [voiceSheet, recordingSheet, uploadSheet].forEach(s => s.classList.remove('open'));
}
backdrop.addEventListener('click', () => {
  stopListening();
  stopDemo();
  closeAllSheets();
});

// ── Voice button → open choice sheet ─────
voiceBtn.addEventListener('click', () => openSheet(voiceSheet));

// ── Choice: Speak ─────────────────────────
optionSpeak.addEventListener('click', () => {
  voiceSheet.classList.remove('open');
  openRecordingSheet();
});

// ── Choice: Upload ─────────────────────────
optionUpload.addEventListener('click', () => {
  voiceSheet.classList.remove('open');
  closeAllSheets();
  audioFileInput.click();
});

// ── Cancel / close voice choice ───────────
sheetCancel.addEventListener('click', closeAllSheets);

// ══════════════════════════════════════════
//  LIVE RECORDING
// ══════════════════════════════════════════

function openRecordingSheet() {
  // Reset transcript display
  state.finalTranscript = '';
  state.interimTranscript = '';
  transcriptFinal.textContent = '';
  transcriptInterim.textContent = '';
  transcriptPlaceholder.style.display = 'inline';
  recSend.disabled = true;
  recDot.classList.remove('paused');
  waveform.classList.remove('paused');
  recLabel.textContent = 'Listening…';

  backdrop.classList.add('show');
  recordingSheet.classList.add('open');

  startListening();
}

// ── Web Speech API ─────────────────────────
function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  const r = new SR();
  r.continuous      = true;
  r.interimResults  = true;   // ← KEY: show words as spoken, not after
  r.lang            = 'en-IN';
  r.maxAlternatives = 1;

  r.onstart = () => {
    state.isListening = true;
  };

  // ── This fires continuously while speaking ──
  r.onresult = (event) => {
    let interim = '';
    let finalChunk = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalChunk += t;
      } else {
        interim += t;
      }
    }

    // Accumulate final segments
    if (finalChunk) state.finalTranscript += finalChunk + ' ';
    state.interimTranscript = interim;

    // Update DOM immediately (word-by-word feel)
    const hasAny = (state.finalTranscript + interim).trim().length > 0;
    transcriptPlaceholder.style.display = hasAny ? 'none' : 'inline';
    transcriptFinal.textContent   = state.finalTranscript;
    transcriptInterim.textContent = interim;

    // Scroll to bottom of transcript box
    transcriptBox.scrollTop = transcriptBox.scrollHeight;

    recSend.disabled = !hasAny;
  };

  r.onerror = (e) => {
    if (e.error === 'not-allowed') {
      recLabel.textContent = '⚠️ Mic access denied — using demo';
      recDot.classList.add('paused');
      waveform.classList.add('paused');
      // Fall back to demo
      startDemo();
    } else if (e.error === 'no-speech') {
      recLabel.textContent = 'No speech detected…';
    }
  };

  r.onend = () => {
    // Restart automatically while we're still in listening state
    if (state.isListening) {
      try { r.start(); } catch (_) {}
    }
  };

  return r;
}

function startListening() {
  if (!state.recognition) {
    state.recognition = initRecognition();
  }

  if (!state.recognition) {
    // Safari or unsupported — run demo
    recLabel.textContent = '🎙️ Demo mode (real mic: Chrome)';
    startDemo();
    return;
  }

  state.isListening = true;
  try { state.recognition.start(); }
  catch (e) {
    // already started — that's fine
  }
}

function stopListening() {
  state.isListening = false;
  if (state.recognition) {
    try { state.recognition.stop(); } catch (_) {}
  }
  recDot.classList.add('paused');
  waveform.classList.add('paused');
  recLabel.textContent = 'Done — review transcript';
  stopDemo();
}

// ── Demo mode (word-by-word simulation) ───
const demoScript = [
  'Can ', 'you ', 'explain ', 'how ', 'real-time ', 'voice ',
  'transcription ', 'could ', 'improve ', 'the ', 'ChatGPT ',
  'mobile ', 'experience ', 'for ', 'Indian ', 'users?'
];
let demoIdx = 0;

function startDemo() {
  demoIdx = 0;
  state.finalTranscript = '';
  transcriptPlaceholder.style.display = 'none';

  state.demoTimer = setInterval(() => {
    if (demoIdx < demoScript.length) {
      const word = demoScript[demoIdx];
      // Show current word as interim, rest as final
      state.finalTranscript += (demoIdx > 0 ? '' : '') + word;
      transcriptFinal.textContent = state.finalTranscript;
      transcriptInterim.textContent = '';
      transcriptBox.scrollTop = transcriptBox.scrollHeight;
      recSend.disabled = false;
      demoIdx++;
    } else {
      stopDemo();
      recLabel.textContent = '✅ Done — send or cancel';
      recDot.classList.add('paused');
      waveform.classList.add('paused');
    }
  }, 280);
}

function stopDemo() {
  if (state.demoTimer) {
    clearInterval(state.demoTimer);
    state.demoTimer = null;
  }
}

// ── Recording sheet controls ───────────────
recClose.addEventListener('click', () => {
  stopListening();
  closeAllSheets();
});
recCancel.addEventListener('click', () => {
  stopListening();
  closeAllSheets();
});
recSend.addEventListener('click', () => {
  stopListening();
  const text = (state.finalTranscript + state.interimTranscript).trim();
  if (!text) { closeAllSheets(); return; }

  closeAllSheets();

  // Pre-fill input with transcript + set pending
  state.pendingTranscript = text;
  state.pendingType = 'voice';
  msgInput.value = text;
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';

  // Immediately send
  handleSend();
});

// ══════════════════════════════════════════
//  AUDIO UPLOAD
// ══════════════════════════════════════════

audioFileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  processUpload(file);
});
uploadCancel.addEventListener('click', () => closeAllSheets());

async function processUpload(file) {
  const name = file.name;
  const sizeMB = (file.size / 1024 / 1024).toFixed(1);

  uploadFileName.textContent = `${name}  (${sizeMB} MB)`;
  uploadProgressBar.style.width = '0%';
  uploadStatus.textContent = 'Analysing audio…';
  uploadOrb.classList.remove('done');

  openSheet(uploadSheet);

  const stages = [
    { pct: 18, msg: 'Detecting language…',        ms: 700  },
    { pct: 42, msg: 'Transcribing speech…',        ms: 1000 },
    { pct: 70, msg: 'Applying corrections…',       ms: 800  },
    { pct: 90, msg: 'Finalising transcript…',      ms: 600  },
    { pct: 100, msg: '✅ Transcription complete!', ms: 400  },
  ];

  for (const stage of stages) {
    await sleep(stage.ms);
    uploadProgressBar.style.width = stage.pct + '%';
    uploadStatus.textContent = stage.msg;
  }

  uploadOrb.classList.add('done');
  await sleep(700);
  closeAllSheets();

  // Pick a demo transcript based on file name hint
  const demos = [
    'Can you help me understand how voice features on mobile apps could be made more comfortable for users in India?',
    'What are the main barriers to voice input adoption on mobile chat apps, and how would you solve them?',
    'Tell me about the difference between real-time transcription and post-processing approaches.',
    'How can product managers measure the success of a voice input feature in a chat application?',
    'I recorded this to ask — what improvements would make ChatGPT voice more usable for working professionals?',
  ];

  const transcript = demos[Math.floor(Math.random() * demos.length)];
  state.pendingTranscript = transcript;
  state.pendingType = 'audio';
  msgInput.value = transcript;
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
  handleSend();
}

// ══════════════════════════════════════════
//  MESSAGING
// ══════════════════════════════════════════

function handleSend() {
  const raw = msgInput.value.trim();
  if (!raw || state.isTyping) return;

  const type = state.pendingType; // 'voice' | 'audio' | null
  const text = raw;

  // Reset pending
  state.pendingTranscript = null;
  state.pendingType = null;
  msgInput.value = '';
  msgInput.style.height = 'auto';

  addUserMessage(text, type);
  simulateAI(text);  // content-aware — no type needed
}

function addUserMessage(text, type = null) {
  hideWelcome();
  const wrap = document.createElement('div');
  wrap.className = 'msg user';

  if (type === 'voice') {
    const tag = document.createElement('div');
    tag.className = 'msg-tag voice-tag';
    tag.innerHTML = '🎙️ Voice input';
    wrap.appendChild(tag);
  } else if (type === 'audio') {
    const tag = document.createElement('div');
    tag.className = 'msg-tag audio-tag';
    tag.innerHTML = '🎵 Audio file';
    wrap.appendChild(tag);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);

  messages.appendChild(wrap);
  scrollDown();
}

async function simulateAI(userMsg) {
  state.isTyping = true;
  sendBtn.disabled = true;

  // Typing indicator
  const wrap = document.createElement('div');
  wrap.className = 'msg ai';
  wrap.id = 'typingWrap';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = '<div class="typing-dots"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  wrap.appendChild(bubble);
  messages.appendChild(wrap);
  scrollDown();

  await sleep(1000 + Math.random() * 700);

  wrap.remove();

  const reply = getReply(userMsg, type);
  const aiWrap = document.createElement('div');
  aiWrap.className = 'msg ai';
  const aiBubble = document.createElement('div');
  aiBubble.className = 'msg-bubble';
  aiBubble.innerHTML = formatReply(reply);
  aiWrap.appendChild(aiBubble);
  messages.appendChild(aiWrap);
  scrollDown();

  state.isTyping = false;
  sendBtn.disabled = false;
}

// ── Content-aware AI reply system ─────────
// Reads the actual transcript text and responds to the topic,
// regardless of whether input came from voice, audio upload, or typing.

function getReply(msg) {
  const t = msg.toLowerCase();

  // Voice UX / adoption barriers
  if (/barrier|adoption|voice feature|voice input|why.*voice|uncomfortable|awkward|not us/.test(t)) {
    return 'The **top barriers to voice input adoption** on mobile chat apps, based on user research:\n\n**1. Accuracy distrust (69% of users)** — No real-time feedback means users assume the system is missing things. Showing a live word-by-word transcript (like Google Assistant) resolves this immediately — no ML improvement needed.\n\n**2. Public/privacy concerns (43%)** — Speaking to a phone feels socially awkward. Fix: let users upload pre-recorded audio privately, then send the transcript from anywhere.\n\n**3. Habit (43%)** — Typing is deeply ingrained. The solution is not to replace it, but to offer voice as a natural complement for the right contexts: commutes, brainstorming, quick lookups.\n\n**4. Editing difficulty** — Users worry they cannot fix mistakes mid-speech. An editable transcript chip before sending solves this cleanly.\n\nThe key insight: these are **UX problems, not AI problems**. The accuracy is already good enough — the interaction design is what needs fixing.';
  }

  // Real-time vs post-processing transcription
  if (/real.?time|interim|post.?process|whisper|transcri|word by word|as you speak/.test(t)) {
    return '**Real-time (interim) transcription** vs **post-processing** — here is the core difference:\n\n**Real-time approach**\n- Words appear as you speak, chunk by chunk\n- Uses `SpeechRecognition.interimResults = true` in the browser\n- Interim results show in grey (tentative), final results confirm in white\n- User always knows they are being heard — builds immediate trust\n- Latency: 100–300ms per chunk\n\n**Post-processing (current ChatGPT)**\n- Records everything silently, transcribes only after you stop speaking\n- User sees nothing while speaking — high uncertainty, high abandonment\n- Feels like a black box\n\n**Why it matters for adoption:** 26% of survey respondents said "I do not trust voice understanding fully." Real-time feedback directly closes this trust gap. The transcript accuracy is identical either way — only the timing of feedback changes, and that alone makes the difference.';
  }

  // Measuring success / metrics / KPIs
  if (/measure|metric|success|kpi|track|analytics|how would you know/.test(t)) {
    return 'Here are the **key success metrics** for a voice input feature:\n\n**Primary — Adoption**\n- Voice DAU / Total DAU ratio (are people using it?)\n- Voice completion rate: mic opened → message actually sent (target: 40%, current est. ~12%)\n- Mic-open-to-send conversion (direct friction measurement)\n\n**Secondary — Quality**\n- Transcript error-correction rate (how often users edit before sending)\n- Session length for voice vs. text sessions (voice should be longer — more expressive)\n- Time-to-first-voice-message (shorter = smoother onboarding)\n\n**Retention**\n- D7 and D30 retention for voice cohort vs. text-only cohort\n- Industry benchmark: users who use voice 3+ times in first week retain at 2x the rate\n\n**Guard rails**\n- In-app CSAT score after voice sessions\n- Support ticket volume around voice issues\n- Whisper API cost per session (unit economics)\n\nMost important single metric: **voice completion rate** — it separates discovery from genuine, lasting adoption.';
  }

  // Improvements for working professionals
  if (/working professional|professional|office|commute|improve.*voice|make.*better|more usable/.test(t)) {
    return 'For **working professionals**, voice input needs three specific improvements:\n\n**1. Private async recording (Upload Audio)**\nAllow uploading pre-recorded MP3 or WAV files. Professionals record during commutes or private moments, then send the transcribed message at their desk — no awkward public speaking.\n\n**2. Word-by-word live transcript**\nIn a short office break, seeing your message captured accurately in real time (without waiting) makes voice viable in tight time windows.\n\n**3. Editable transcript chip**\nOne-tap editing before sending is critical for professionals who need precise language — technical terms, proper nouns, code references.\n\n**Contextual prompt**\nFor messages over ~50 words, proactively surface: "This is a long message — try voice instead?" Working professionals often have rich, multi-part questions where speaking is significantly faster than typing.\n\nFrom your survey: 22–25 year old working professionals already use WhatsApp voice notes comfortably. The behavior exists — ChatGPT just needs to meet them where they are.';
  }

  // India / regional context
  if (/india|indian|comfort|hindi|regional|public space|shared/.test(t)) {
    return 'Voice input adoption in **India** has unique dynamics:\n\n**What the survey (n=23) shows:**\n- 78% use WhatsApp voice notes comfortably — the muscle memory exists\n- Only 26% have ever used ChatGPT voice frequently\n- Top unique concern: public embarrassment of speaking to AI in crowded spaces (open offices, public transit, shared homes)\n\n**Cultural factors:**\n- Shared living spaces mean less private time for live voice\n- Code-switching between English and Hindi mid-sentence causes transcription errors\n- Siri and Alexa normalized short voice commands — not long AI conversations\n\n**Solutions:**\n1. Audio upload — record privately, send from anywhere\n2. Regional language support — Hindi, Tamil, Bengali (Phase 2)\n3. Confidence nudges — show accuracy % from past sessions to build trust over time\n\nThe opportunity: solving for India unlocks 400M+ mobile-first users who are already primed for AI voice interaction, just waiting for the right UX.';
  }

  // Machine learning
  if (/machine learning|ml\b|supervised|neural|deep learning|algorithm/.test(t)) {
    return '**Machine learning** is a branch of AI where systems learn patterns from data rather than following hardcoded rules.\n\n**Simple analogy:** Instead of writing "if 4 legs + meows = cat," you feed thousands of labeled photos to an algorithm and it discovers the pattern itself.\n\n**The 3 main paradigms:**\n\n- **Supervised learning** — trained on labeled input→output pairs (most common)\n  Examples: spam filters, image classification, voice transcription (Whisper)\n\n- **Unsupervised learning** — finds hidden structure in unlabeled data\n  Examples: customer segmentation, anomaly detection\n\n- **Reinforcement learning** — agent learns by trial-and-error with reward signals\n  Examples: game-playing AI (AlphaGo), robotics, RLHF used in ChatGPT itself\n\n**Relevant to voice:** Whisper (OpenAI transcription model) is supervised, trained on 680,000 hours of multilingual audio. Accuracy is already near-human — which confirms that the barrier to voice adoption is **UX design**, not model quality.';
  }

  // Email / writing
  if (/email|write.*email|draft|manager|letter|message to/.test(t)) {
    return 'Here is a clean **professional email draft**:\n\n**Subject:** Quick Sync — [Topic]\n\nHi [Name],\n\nHope you are doing well! I wanted to flag something I have been working on and get your input.\n\n[1–2 sentences with context or the specific update.]\n\nWould you have 15 minutes this week to connect? I am flexible and happy to work around your schedule.\n\nThanks so much,\nSakshi\n\n---\n*Tips for high read-rate emails:*\n- Subject line under 50 characters\n- Lead with the ask, not the context\n- One clear call-to-action per email\n- Busy managers scan in under 10 seconds — make the first line count';
  }

  // PM / product management
  if (/product manager|pm role|prioriti|roadmap|user research|persona|prd|feature spec/.test(t)) {
    return 'Key **PM frameworks** for your scenario:\n\n**Prioritisation — Impact x Effort x Confidence**\nScore each solution 1–5 on each axis and pick the highest composite score.\n- High impact + low effort = ship fast (e.g., real-time transcript display)\n- High impact + high effort = plan carefully (e.g., regional language support)\n- Low impact = descope ruthlessly\n\n**Defining success:**\nFor any feature, define: North Star metric + 2–3 supporting metrics + 1–2 guard rails (metrics you cannot let regress).\n\n**Research → insight → solution:**\n1. Observe the behavior gap (voice tried once, never returned)\n2. Identify the root cause (no feedback = distrust, not inaccuracy)\n3. Design to close specifically that gap\n4. Measure: did the gap close?\n\n**Most common PM mistake:** Building new features instead of removing friction in existing ones. Your survey data is clear — voice capability exists, friction is killing it. Fix the friction first.';
  }

  // Coding
  if (/code|coding|python|javascript|debug|function|api|algorithm|program|syntax/.test(t)) {
    return 'Happy to help with coding! To give you the most useful answer, share:\n\n- **Language or framework** you are working in\n- **What you are trying to build** or the exact error message\n- **What you have tried** already\n\nIn the meantime, a universal debugging approach:\n\n```\n// Step 1 — log your actual input before any logic\nconsole.log("Input:", input, typeof input);\n\n// Step 2 — isolate the failing step\n// Comment out everything after the suspected line\n\n// Step 3 — check types\n// 80% of bugs are type mismatches or undefined variables\n```\n\nPaste your code and I will give you a specific fix!';
  }

  // Generic fallback — still useful and specific
  const isQuestion = t.includes('?') || /^(what|how|why|can|could|should|is|are|do|does|will)/.test(t);
  if (isQuestion) {
    return 'Great question — here is how I would think through this:\n\n**Understand the real problem first**\nWhat you are asking and what you actually need are sometimes different. The most useful answer starts with: what outcome are you trying to achieve?\n\n**Break it down**\nMost hard questions are 2–3 simpler questions stacked on top of each other. Separate them and they become tractable.\n\n**Think about constraints**\nTime, resources, confidence, or clarity — which constraint is actually binding here? Removing the right constraint unlocks everything else.\n\nCould you share a bit more context? I will give you a much more specific and useful answer.';
  }

  return 'Got it! Here is how I would approach this:\n\nStart by identifying the one thing that, if true, would make everything else easier or unnecessary. That is your leverage point.\n\nFrom there:\n1. What is the smallest possible action that tests your assumption?\n2. What would a good outcome look like — and how would you measure it?\n3. Who else has solved a similar problem, and what can you learn from them?\n\nShare more detail and I can give you something much more targeted.';
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function formatReply(text) {
  return '<p>' + text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    + '</p>';
}

// ── Helpers ────────────────────────────────
function hideWelcome() {
  if (welcomeState && welcomeState.style.display !== 'none') {
    welcomeState.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    welcomeState.style.opacity = '0';
    welcomeState.style.transform = 'translateY(-8px)';
    setTimeout(() => { welcomeState.style.display = 'none'; }, 300);
  }
}

function scrollDown() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Welcome pill helper ────────────────────
function insertExample(text) {
  hideWelcome();
  msgInput.value = text;
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
  msgInput.focus();
  handleSend();
}
window.insertExample = insertExample;

// ── New chat button ────────────────────────
$('editBtn').addEventListener('click', () => {
  messages.innerHTML = '';
  welcomeState.style.display = '';
  welcomeState.style.opacity = '1';
  welcomeState.style.transform = 'translateY(0)';
  msgInput.value = '';
  msgInput.style.height = 'auto';
  state.pendingTranscript = null;
  state.pendingType = null;
  stopListening();
  closeAllSheets();
});
