/**
 * DOM Element References
 *
 * Centralized cache of all DOM elements used throughout the app.
 * Initialized once on page load to avoid repeated querySelector calls.
 */

export const dom = {
  // Game display
  welcome: null,
  gameOutput: null,
  statusBar: null,
  upperWindow: null,
  lowerWindow: null,

  // Command input
  userInput: null,
  commandLine: null,
  voiceIndicator: null,

  // Select game button
  selectGameBtn: null,

  // Status and controls
  status: null,
  muteBtn: null,
  pausePlayBtn: null,

  // Voice settings
  voiceSelect: null,
  appVoiceSelect: null,
  testAppVoiceBtn: null,

  // Voice feedback
  voiceTranscript: null,
  voiceListeningIndicator: null,
  voiceMeterDot: null,

  // Settings
  settingsBtn: null,
  settingsPanel: null,
  settingsOverlay: null,
  closeSettingsBtn: null,
  addPronunciationBtn: null,
  pronunciationList: null,
  pronounceWordInput: null,
  pronounceAsInput: null
};

/**
 * Initialize all DOM element references
 * Call this once on page load
 */
export function initDOM() {
  // Game display
  dom.welcome = document.getElementById('welcome');
  dom.gameOutput = document.getElementById('gameOutput');
  dom.statusBar = document.getElementById('statusBar');
  dom.upperWindow = document.getElementById('upperWindow');
  dom.lowerWindow = document.getElementById('lowerWindow');

  // Command input
  dom.userInput = document.getElementById('messageInput');
  dom.commandLine = document.getElementById('commandLine');
  dom.voiceIndicator = document.getElementById('voiceIndicator');

  // Select game button
  dom.selectGameBtn = document.getElementById('selectGameBtn');

  // Status and controls
  dom.status = document.getElementById('status');
  dom.muteBtn = document.getElementById('muteBtn');
  dom.convModeBtn = document.getElementById('convModeBtn');
  dom.pausePlayBtn = document.getElementById('pausePlayBtn');

  // Voice settings
  dom.voiceSelect = document.getElementById('voiceSelect');
  dom.appVoiceSelect = document.getElementById('appVoiceSelect');
  dom.testAppVoiceBtn = document.getElementById('testAppVoiceBtn');

  // Voice feedback
  dom.voiceTranscript = document.getElementById('voiceTranscript');
  dom.voiceListeningIndicator = document.getElementById('voiceListeningIndicator');
  dom.voiceMeterDot = document.getElementById('voiceMeterDot');

  // Settings
  dom.settingsBtn = document.getElementById('settingsBtn');
  dom.settingsPanel = document.getElementById('settingsPanel');
  dom.settingsOverlay = document.getElementById('settingsOverlay');
  dom.closeSettingsBtn = document.getElementById('closeSettingsBtn');
  dom.addPronunciationBtn = document.getElementById('addPronunciationBtn');
  dom.pronunciationList = document.getElementById('pronunciationList');
  dom.pronounceWordInput = document.getElementById('newWord');
  dom.pronounceAsInput = document.getElementById('newPronunciation');

  // Validate critical elements exist
  validateDOM();
}

/**
 * Validate that critical DOM elements exist
 * Throws error if required elements are missing
 */
function validateDOM() {
  const required = [
    'gameOutput',
    'statusBar',
    'upperWindow',
    'lowerWindow',
    'status'
  ];

  for (const elementName of required) {
    if (!dom[elementName]) {
      throw new Error(`Critical DOM element missing: ${elementName}`);
    }
  }

}
