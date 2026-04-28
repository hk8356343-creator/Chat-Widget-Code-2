/*!
 * Premium Chat Widget
 * File: chat-widget.js
 * Version: 1.2.0
 * Notes:
 * - Full file with all previous features preserved
 * - Added extended style color controls via config.style.*
 * - Supports both ui.accentColor and style.* palette overrides
 */

(function () {
  "use strict";

  const Utils = {
    isObject(value) {
      return value && typeof value === "object" && !Array.isArray(value);
    },
    deepMerge(target, source) {
      const output = { ...target };
      if (Utils.isObject(target) && Utils.isObject(source)) {
        Object.keys(source).forEach((key) => {
          if (Utils.isObject(source[key])) {
            if (!(key in target)) output[key] = source[key];
            else output[key] = Utils.deepMerge(target[key], source[key]);
          } else {
            output[key] = source[key];
          }
        });
      }
      return output;
    },
    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    },
    nowISO() {
      return new Date().toISOString();
    },
    formatTime(date, locale = undefined) {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    },
    generateSessionId(prefix = "cw") {
      const rand = Math.random().toString(36).slice(2, 10);
      const ts = Date.now().toString(36);
      return `${prefix}_${ts}_${rand}`;
    },
    escapeHTML(str = "") {
      return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    },
    sanitizeUrl(url = "") {
      try {
        const parsed = new URL(url, window.location.origin);
        if (["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) return parsed.href;
        return "#";
      } catch {
        return "#";
      }
    },
    getRouteInfo() {
      return {
        url: window.location.href,
        path: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        title: document.title || "",
        referrer: document.referrer || "",
      };
    },
    getUserAgentInfo() {
      return {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      };
    },
    getCurrentScriptConfig() {
      const scripts = document.querySelectorAll("script[data-chat-widget]");
      let datasetConfig = {};
      if (scripts.length) {
        const script = scripts[scripts.length - 1];
        const raw = script.getAttribute("data-chat-widget");
        if (raw) {
          try {
            datasetConfig = JSON.parse(raw);
          } catch (e) {
            console.warn("[ChatWidget] Invalid data-chat-widget JSON:", e);
          }
        }
      }
      const globalConfig = window.ChatWidgetConfig || {};
      return Utils.deepMerge(datasetConfig, globalConfig);
    },
    wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
    pick(val, fallback) {
      return typeof val === "string" && val.trim() ? val.trim() : fallback;
    },
  };

  const DEFAULT_CONFIG = {
    company: {
      name: "Acme Support",
      logoUrl: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=80&q=80",
      onlineLabel: "Online now",
      responseTimeText: "Usually replies in a few minutes",
    },

    ui: {
      position: "right",
      zIndex: 2147483000,
      theme: "auto",
      accentColor: "#2563eb",
      borderRadius: 16,
      launcherSize: 60,
      widthDesktop: 380,
      heightDesktop: 640,
      animationDurationMs: 260,
      fontFamily:
        "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji",
      showBrandLine: true,
    },

    // NEW: richer style tokens (fully optional)
    style: {
      primaryColor: "",
      secondaryColor: "",
      backgroundColor: "",
      textColor: "",
      botBubbleColor: "",
      userBubbleTextColor: "",
      headerBackground: "",
      inputBackground: "",
      inputTextColor: "",
      borderColor: "",
      teaserBackground: "",
      teaserTextColor: "",
      launcherTextColor: "",
    },

    behavior: {
      autoOpen: false,
      autoOpenDelayMs: 0,
      enableSounds: false,
      sendOnEnter: true,
      inputMaxLength: 2000,
      typingIndicatorMinMs: 500,
      typingIndicatorMaxMs: 1200,
      persistKey: "premium_chat_widget_state_v1",
      teaserSessionKey: "premium_chat_widget_teaser_closed_session",
      autoScrollBehavior: "smooth",
    },

    webhook: {
      url: "",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      responseParser: null,
      timeoutMs: 25000,
    },

    welcome: {
      enabled: true,
      message: "Hi there 👋\nHow can I help you today?",
      delayMs: 400,
    },

    teaser: {
      enabled: true,
      autoShowDelayMs: 3200,
      title: "Need help?",
      subtitle: "Chat with us for quick answers.",
      ctaText: "Chat now",
      showOnlyWhenClosed: true,
    },

    social: {
      enabled: true,
      items: [
        { name: "Facebook", url: "https://facebook.com/" },
        { name: "WhatsApp", url: "https://wa.me/" },
        { name: "Instagram", url: "https://instagram.com/" },
      ],
    },

    sound: {
      notificationUrl: "",
      volume: 0.4,
    },

    labels: {
      inputPlaceholder: "Type your message...",
      sendButton: "Send",
      closeButtonAria: "Close chat",
      openButtonAria: "Open chat",
      teaserCloseAria: "Close teaser",
    },

    callbacks: {
      onOpen: null,
      onClose: null,
      onMessageSent: null,
      onMessageReceived: null,
      onError: null,
    },

    metadata: {
      source: "website-chat-widget",
      version: "1.2.0",
      extra: {},
    },

    handoff: {
      enabled: true,
      provider: "future-chatwoot",
      notes: "Structure prepared for handoff integration",
    },
  };

  class StorageService {
    constructor(storageKey) {
      this.storageKey = storageKey;
      this.memoryFallback = {};
    }
    get canUseLocalStorage() {
      try {
        const testKey = "__chat_widget_test__";
        window.localStorage.setItem(testKey, "1");
        window.localStorage.removeItem(testKey);
        return true;
      } catch {
        return false;
      }
    }
    readState() {
      if (this.canUseLocalStorage) {
        const raw = window.localStorage.getItem(this.storageKey);
        if (!raw) return {};
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
      }
      return this.memoryFallback;
    }
    writeState(partial) {
      const current = this.readState();
      const merged = { ...current, ...partial };
      if (this.canUseLocalStorage) window.localStorage.setItem(this.storageKey, JSON.stringify(merged));
      else this.memoryFallback = merged;
      return merged;
    }
    getSessionValue(key) {
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        return null;
      }
    }
    setSessionValue(key, value) {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {}
    }
  }

  class SoundService {
    constructor(config) {
      this.config = config;
      this.audio = null;
      this.enabled = !!config.behavior.enableSounds;
      this.init();
    }
    init() {
      if (!this.enabled) return;
      if (this.config.sound.notificationUrl) {
        this.audio = new Audio(this.config.sound.notificationUrl);
        this.audio.volume = Utils.clamp(this.config.sound.volume || 0.4, 0, 1);
      }
    }
    beepFallback() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 780;
        gain.gain.value = 0.02;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } catch {}
    }
    playNotification() {
      if (!this.enabled) return;
      if (this.audio) {
        this.audio.currentTime = 0;
        this.audio.play().catch(() => {});
      } else this.beepFallback();
    }
  }

  class WebhookService {
    constructor(config) {
      this.config = config;
    }
    async sendMessage(payload) {
      const url = this.config.webhook.url;
      if (!url) throw new Error("Webhook URL is not configured.");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.webhook.timeoutMs);

      try {
        const response = await fetch(url, {
          method: this.config.webhook.method || "POST",
          headers: this.config.webhook.headers || { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type") || "";
        let data;
        if (contentType.includes("application/json")) data = await response.json();
        else data = { text: await response.text() };

        if (!response.ok) throw new Error(`Webhook error (${response.status})`);
        return this.parseResponse(data);
      } finally {
        clearTimeout(timeout);
      }
    }
    parseResponse(data) {
    if (typeof this.config.webhook.responseParser === "function") return this.config.webhook.responseParser(data);

  const extractText = (obj) => {
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    return (
      obj.reply ??
      obj.message ??
      obj.text ??
      obj.output ??
      obj.answer ??
      obj.response ??
      obj.data?.reply ??
      obj.data?.message ??
      obj.data?.text ??
      obj.data?.output ??
      obj.data?.answer ??
      obj.data?.response ??
      ""
    );
  };

  const source = Array.isArray(data) ? (data[0] || {}) : data;
  const text = String(extractText(source) || "").trim();

  return {
    text,
    timestamp: source?.timestamp || source?.createdAt || source?.data?.timestamp || Utils.nowISO(),
  };
    }
  }

  class ChatWidget {
    constructor(customConfig = {}) {
      this.config = Utils.deepMerge(DEFAULT_CONFIG, customConfig);

      this.storage = new StorageService(this.config.behavior.persistKey);
      this.sound = new SoundService(this.config);
      this.webhook = new WebhookService(this.config);

      this.state = {
        isOpen: false,
        isTyping: false,
        messages: [],
        sessionId: "",
        teaserClosedInSession: false,
        hasShownWelcome: false,
        initialized: false,
      };

      this.els = {};
      this.bound = {
        handleLauncherClick: this.handleLauncherClick.bind(this),
        handleCloseClick: this.handleCloseClick.bind(this),
        handleSendClick: this.handleSendClick.bind(this),
        handleInputKeydown: this.handleInputKeydown.bind(this),
        handleTeaserClose: this.handleTeaserClose.bind(this),
        handleTeaserOpen: this.handleTeaserOpen.bind(this),
        handleSystemThemeChange: this.handleSystemThemeChange.bind(this),
      };
    }

    getPalette() {
      const s = this.config.style || {};
      const primary = Utils.pick(s.primaryColor, this.config.ui.accentColor);
      const secondary = Utils.pick(s.secondaryColor, "#3b82f6");
      return {
        primary,
        secondary,
        bg: Utils.pick(s.backgroundColor, "#ffffff"),
        text: Utils.pick(s.textColor, "#0f172a"),
        botBubble: Utils.pick(s.botBubbleColor, "rgba(148,163,184,.14)"),
        userBubbleText: Utils.pick(s.userBubbleTextColor, "#ffffff"),
        headerBg: Utils.pick(s.headerBackground, "transparent"),
        inputBg: Utils.pick(s.inputBackground, "transparent"),
        inputText: Utils.pick(s.inputTextColor, "inherit"),
        border: Utils.pick(s.borderColor, "rgba(148,163,184,.2)"),
        teaserBg: Utils.pick(s.teaserBackground, "#ffffff"),
        teaserText: Utils.pick(s.teaserTextColor, "#0f172a"),
        launcherText: Utils.pick(s.launcherTextColor, "#ffffff"),
      };
    }

    init() {
      if (this.state.initialized) return;
      this.loadPersistedState();
      this.injectStyles();
      this.createDOM();
      this.attachEvents();
      this.applyTheme();
      this.renderMessages();
      this.ensureSessionId();
      this.handleWelcomeMessage();
      this.setupTeaser();
      this.autoOpenIfConfigured();
      this.state.initialized = true;
    }

    loadPersistedState() {
      const persisted = this.storage.readState();
      this.state.messages = Array.isArray(persisted.messages) ? persisted.messages : [];
      this.state.sessionId = persisted.sessionId || "";
      this.state.isOpen = !!persisted.isOpen;
      this.state.hasShownWelcome = !!persisted.hasShownWelcome;
      this.state.teaserClosedInSession = false;
    }

    persistState() {
      this.storage.writeState({
        messages: this.state.messages,
        sessionId: this.state.sessionId,
        isOpen: this.state.isOpen,
        hasShownWelcome: this.state.hasShownWelcome,
      });
    }

    ensureSessionId() {
      if (!this.state.sessionId) {
        this.state.sessionId = Utils.generateSessionId("chat");
        this.persistState();
      }
    }

    getEffectiveTheme() {
      const mode = this.config.ui.theme;
      if (mode === "light" || mode === "dark") return mode;
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    }

    applyTheme() {
      const theme = this.getEffectiveTheme();
      if (!this.els.root) return;
      this.els.root.classList.remove("cw-theme-light", "cw-theme-dark");
      this.els.root.classList.add(theme === "dark" ? "cw-theme-dark" : "cw-theme-light");
      this.els.root.setAttribute("data-theme", theme);
    }

    handleSystemThemeChange() {
      if (this.config.ui.theme === "auto") this.applyTheme();
    }

    injectStyles() {
      if (document.getElementById("premium-chat-widget-styles")) return;
      const p = this.getPalette();

      const style = document.createElement("style");
      style.id = "premium-chat-widget-styles";
      style.textContent = `
:root{
  --cw-accent:${p.primary};
  --cw-accent-2:${p.secondary};
  --cw-radius:${this.config.ui.borderRadius}px;
  --cw-z:${this.config.ui.zIndex};
  --cw-font:${this.config.ui.fontFamily};
  --cw-shadow:0 12px 40px rgba(2,6,23,.15), 0 2px 12px rgba(2,6,23,.08);
  --cw-shadow-soft:0 8px 30px rgba(2,6,23,.12);
  --cw-speed:${this.config.ui.animationDurationMs}ms;

  --cw-bg:${p.bg};
  --cw-text:${p.text};
  --cw-border:${p.border};
  --cw-bot-bubble:${p.botBubble};
  --cw-user-bubble-text:${p.userBubbleText};
  --cw-header-bg:${p.headerBg};
  --cw-input-bg:${p.inputBg};
  --cw-input-text:${p.inputText};
  --cw-teaser-bg:${p.teaserBg};
  --cw-teaser-text:${p.teaserText};
  --cw-launcher-text:${p.launcherText};
}
.cw-root,*[data-cw]{box-sizing:border-box;font-family:var(--cw-font)}
.cw-root{position:fixed;bottom:22px;${this.config.ui.position}:22px;z-index:var(--cw-z)}
.cw-launcher{
  width:${this.config.ui.launcherSize}px;height:${this.config.ui.launcherSize}px;border:none;cursor:pointer;
  border-radius:999px;background:linear-gradient(135deg,var(--cw-accent),var(--cw-accent-2));
  color:var(--cw-launcher-text);display:flex;align-items:center;justify-content:center;box-shadow:var(--cw-shadow);
  transition:transform .22s ease, box-shadow .22s ease, opacity .2s ease;
}
.cw-launcher:hover{transform:translateY(-2px) scale(1.02)}
.cw-launcher:active{transform:translateY(0) scale(.98)}
.cw-panel{
  position:absolute;bottom:78px;${this.config.ui.position}:0;width:${this.config.ui.widthDesktop}px;height:${this.config.ui.heightDesktop}px;
  border-radius:24px;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--cw-shadow);
  transform-origin:bottom ${this.config.ui.position};opacity:0;pointer-events:none;transform:translateY(16px) scale(.98);
  transition:opacity var(--cw-speed) ease, transform var(--cw-speed) ease;
}
.cw-root.open .cw-panel{opacity:1;pointer-events:auto;transform:translateY(0) scale(1)}
.cw-root.open .cw-launcher{opacity:0;pointer-events:none;transform:scale(.8)}
.cw-theme-light .cw-panel{background:var(--cw-bg);color:var(--cw-text)}
.cw-theme-dark .cw-panel{background:#0b1220;color:#e2e8f0;border:1px solid rgba(148,163,184,.16)}
.cw-header{
  background:var(--cw-header-bg);
  padding:14px 16px;display:flex;align-items:center;justify-content:space-between;
  border-bottom:1px solid var(--cw-border);backdrop-filter: blur(8px);
}
.cw-brand{display:flex;align-items:center;gap:12px;min-width:0}
.cw-logo-wrap{position:relative}
.cw-logo{width:40px;height:40px;border-radius:12px;object-fit:cover;display:block}
.cw-status-dot{position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;background:#22c55e;border-radius:999px;border:2px solid #fff}
.cw-theme-dark .cw-status-dot{border-color:#0b1220}
.cw-title{font-weight:700;line-height:1.2}
.cw-subtitle{font-size:12px;opacity:.72;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.cw-close{
  width:34px;height:34px;border:none;border-radius:10px;background:transparent;cursor:pointer;
  color:inherit;opacity:.7;transition:background .2s ease,opacity .2s ease;
}
.cw-close:hover{background:rgba(148,163,184,.16);opacity:1}
.cw-messages{
  flex:1;overflow:auto;padding:14px 14px 10px;display:flex;flex-direction:column;gap:10px;
  scroll-behavior:smooth;
}
.cw-msg-row{display:flex;gap:8px;align-items:flex-end;max-width:86%}
.cw-msg-row.user{align-self:flex-end;justify-content:flex-end}
.cw-msg-row.bot{align-self:flex-start}
.cw-avatar{width:28px;height:28px;border-radius:999px;object-fit:cover;flex:0 0 auto}
.cw-bubble{
  border-radius:16px;padding:10px 12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-break:break-word;
}
.cw-msg-row.user .cw-bubble{
  background:linear-gradient(135deg,var(--cw-accent),var(--cw-accent-2));color:var(--cw-user-bubble-text);border-bottom-right-radius:6px;
}
.cw-msg-row.bot .cw-bubble{
  background:var(--cw-bot-bubble);color:inherit;border-bottom-left-radius:6px;
}
.cw-time{font-size:11px;opacity:.6;margin-top:4px}
.cw-msg-col{display:flex;flex-direction:column}
.cw-typing{align-self:flex-start;display:none;align-items:center;gap:8px;padding:0 14px 8px}
.cw-typing.active{display:flex}
.cw-typing-bubble{background:var(--cw-bot-bubble);padding:10px 12px;border-radius:14px;display:flex;gap:4px}
.cw-dot{width:6px;height:6px;border-radius:999px;background:currentColor;opacity:.45;animation:cw-dot 1.1s infinite}
.cw-dot:nth-child(2){animation-delay:.16s}
.cw-dot:nth-child(3){animation-delay:.32s}
@keyframes cw-dot{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-4px);opacity:.9}}
.cw-input-wrap{
  padding:12px;border-top:1px solid var(--cw-border);display:flex;gap:8px;align-items:center;
}
.cw-input{
  flex:1;border:1px solid color-mix(in srgb,var(--cw-border) 100%, transparent);background:var(--cw-input-bg);color:var(--cw-input-text);
  border-radius:12px;padding:10px 12px;font-size:14px;outline:none;transition:border .2s ease, box-shadow .2s ease;
}
.cw-input:focus{border-color:var(--cw-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--cw-accent) 22%, transparent)}
.cw-send{
  border:none;background:var(--cw-accent);color:#fff;border-radius:12px;padding:10px 14px;cursor:pointer;
  font-weight:600;transition:transform .16s ease,opacity .2s ease;
}
.cw-send:hover{transform:translateY(-1px)}
.cw-send:disabled{opacity:.5;cursor:not-allowed;transform:none}
.cw-social-row{display:flex;gap:8px;padding:0 12px 10px;flex-wrap:wrap}
.cw-social-btn{
  display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-size:12px;font-weight:600;
  padding:8px 10px;border-radius:10px;color:inherit;background:rgba(148,163,184,.14);
  transition:transform .16s ease, background .2s ease, box-shadow .2s ease;
}
.cw-social-btn:hover{transform:translateY(-1px);background:rgba(148,163,184,.22);box-shadow:0 4px 14px rgba(2,6,23,.08)}
.cw-social-btn.facebook{color:#1877f2}
.cw-social-btn.whatsapp{color:#22c55e}
.cw-social-btn.instagram{color:#d946ef}
.cw-brandline{font-size:11px;opacity:.6;text-align:center;padding:0 0 8px}
.cw-teaser{
  position:absolute;bottom:76px;${this.config.ui.position}:0;width:min(320px,calc(100vw - 24px));
  background:var(--cw-teaser-bg);color:var(--cw-teaser-text);border-radius:16px;box-shadow:var(--cw-shadow-soft);padding:12px 12px 12px 14px;
  display:flex;gap:10px;align-items:flex-start;opacity:0;transform:translateY(8px) scale(.98);pointer-events:none;
  transition:opacity .24s ease, transform .24s ease;
}
.cw-theme-dark .cw-teaser{background:#111827;color:#e5e7eb;border:1px solid rgba(148,163,184,.2)}
.cw-teaser.show{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
.cw-teaser-main{flex:1;cursor:pointer}
.cw-teaser-title{font-weight:700;font-size:14px}
.cw-teaser-sub{font-size:12px;opacity:.72;margin-top:2px}
.cw-teaser-cta{display:inline-block;margin-top:8px;font-size:12px;font-weight:600;color:var(--cw-accent)}
.cw-teaser-close{border:none;background:transparent;color:inherit;opacity:.65;cursor:pointer;border-radius:8px;width:24px;height:24px}
.cw-teaser-close:hover{background:rgba(148,163,184,.16);opacity:1}
@media (max-width:640px){
  .cw-root{left:10px !important;right:10px !important;bottom:10px}
  .cw-panel{left:0 !important;right:0 !important;width:auto;height:min(76vh,620px);bottom:74px}
  .cw-teaser{left:0 !important;right:0 !important;width:auto}
}
      `;
      document.head.appendChild(style);
    }

    getSocialIconSvg(name) {
      const map = {
        Facebook: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.6 1.6-1.6h1.7V4.8c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.2V11H8v3h2.7v8h2.8z"/></svg>`,
        WhatsApp: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 3.9A11 11 0 0 0 3.2 18.1L2 22l4-1.1A11 11 0 1 0 20 3.9Zm-8 16a9 9 0 0 1-4.6-1.3l-.3-.2-2.4.7.8-2.3-.2-.4A9 9 0 1 1 12 19.9Zm5-6.7c-.3-.2-1.7-.8-2-.9s-.5-.2-.7.2-.8.9-1 .9-.4 0-.7-.2a7.3 7.3 0 0 1-2.1-1.8c-.6-.8-.7-1-.5-1.3.1-.2.3-.4.5-.6.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.7-1.8c-.2-.5-.4-.4-.7-.4h-.6c-.2 0-.5.1-.8.4s-1 1-.9 2.3c0 1.3 1 2.6 1.2 2.8.1.2 2 3 4.9 4.1 2.9 1.1 2.9.7 3.5.7s1.8-.7 2-1.4c.2-.7.2-1.3.2-1.4 0-.1-.2-.2-.5-.4Z"/></svg>`,
        Instagram: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm11.5 1.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>`,
      };
      return map[name] || map.Facebook;
    }

    renderSocialIcons() {
      if (!this.config.social?.enabled) return "";
      const items = Array.isArray(this.config.social.items) ? this.config.social.items : [];
      if (!items.length) return "";
      return items
        .filter((item) => ["Facebook", "WhatsApp", "Instagram"].includes(item?.name))
        .map((item) => {
          const name = item.name;
          const safeName = Utils.escapeHTML(name);
          const safeUrl = Utils.escapeHTML(Utils.sanitizeUrl(item.url || "#"));
          const icon = this.getSocialIconSvg(name);
          const cls = name.toLowerCase();
          return `<a class="cw-social-btn ${cls}" href="${safeUrl}" target="_blank" rel="noopener noreferrer" aria-label="${safeName}">${icon}<span>${safeName}</span></a>`;
        })
        .join("");
    }

    createDOM() {
      const root = document.createElement("div");
      root.className = "cw-root";
      root.setAttribute("data-cw", "root");
      root.classList.add(this.getEffectiveTheme() === "dark" ? "cw-theme-dark" : "cw-theme-light");

      root.innerHTML = `
        <button class="cw-launcher" aria-label="${Utils.escapeHTML(this.config.labels.openButtonAria)}">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4.5A2.5 2.5 0 0 1 3 13V5.5Z" fill="currentColor"/></svg>
        </button>

        <div class="cw-teaser" data-cw="teaser">
          <div class="cw-teaser-main" data-cw="teaser-open">
            <div class="cw-teaser-title">${Utils.escapeHTML(this.config.teaser.title)}</div>
            <div class="cw-teaser-sub">${Utils.escapeHTML(this.config.teaser.subtitle)}</div>
            <span class="cw-teaser-cta">${Utils.escapeHTML(this.config.teaser.ctaText)}</span>
          </div>
          <button class="cw-teaser-close" data-cw="teaser-close" aria-label="${Utils.escapeHTML(this.config.labels.teaserCloseAria)}">×</button>
        </div>

        <section class="cw-panel" role="dialog" aria-label="Chat widget">
          <header class="cw-header">
            <div class="cw-brand">
              <div class="cw-logo-wrap">
                <img class="cw-logo" src="${Utils.escapeHTML(this.config.company.logoUrl)}" alt="logo" />
                <span class="cw-status-dot"></span>
              </div>
              <div>
                <div class="cw-title">${Utils.escapeHTML(this.config.company.name)}</div>
                <div class="cw-subtitle">${Utils.escapeHTML(this.config.company.responseTimeText)}</div>
              </div>
            </div>
            <button class="cw-close" aria-label="${Utils.escapeHTML(this.config.labels.closeButtonAria)}">✕</button>
          </header>

          <div class="cw-messages" data-cw="messages"></div>

          <div class="cw-typing" data-cw="typing">
            <img class="cw-avatar" src="${Utils.escapeHTML(this.config.company.logoUrl)}" alt="agent"/>
            <div class="cw-typing-bubble"><span class="cw-dot"></span><span class="cw-dot"></span><span class="cw-dot"></span></div>
          </div>

          <div class="cw-input-wrap">
            <input class="cw-input" data-cw="input" maxlength="${this.config.behavior.inputMaxLength}" placeholder="${Utils.escapeHTML(this.config.labels.inputPlaceholder)}" />
            <button class="cw-send" data-cw="send">${Utils.escapeHTML(this.config.labels.sendButton)}</button>
          </div>

          ${this.config.social?.enabled ? `<div class="cw-social-row" data-cw="social-row">${this.renderSocialIcons()}</div>` : ""}
          ${this.config.ui.showBrandLine ? `<div class="cw-brandline">Powered by ${Utils.escapeHTML(this.config.company.name)}</div>` : ""}
        </section>
      `;

      document.body.appendChild(root);
      this.els.root = root;
      this.els.launcher = root.querySelector(".cw-launcher");
      this.els.panel = root.querySelector(".cw-panel");
      this.els.messages = root.querySelector('[data-cw="messages"]');
      this.els.input = root.querySelector('[data-cw="input"]');
      this.els.sendBtn = root.querySelector('[data-cw="send"]');
      this.els.typingRow = root.querySelector('[data-cw="typing"]');
      this.els.teaser = root.querySelector('[data-cw="teaser"]');
      this.els.teaserClose = root.querySelector('[data-cw="teaser-close"]');
      this.els.teaserOpen = root.querySelector('[data-cw="teaser-open"]');

      if (this.state.isOpen) this.open(false);
    }

    attachEvents() {
      this.els.launcher.addEventListener("click", this.bound.handleLauncherClick);
      this.els.panel.querySelector(".cw-close").addEventListener("click", this.bound.handleCloseClick);
      this.els.sendBtn.addEventListener("click", this.bound.handleSendClick);
      this.els.input.addEventListener("keydown", this.bound.handleInputKeydown);
      this.els.teaserClose.addEventListener("click", this.bound.handleTeaserClose);
      this.els.teaserOpen.addEventListener("click", this.bound.handleTeaserOpen);

      if (window.matchMedia) {
        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        if (mql.addEventListener) mql.addEventListener("change", this.bound.handleSystemThemeChange);
        else if (mql.addListener) mql.addListener(this.bound.handleSystemThemeChange);
      }
    }

    autoOpenIfConfigured() {
      if (!this.config.behavior.autoOpen) return;
      setTimeout(() => this.open(true), Math.max(0, this.config.behavior.autoOpenDelayMs || 0));
    }

    setupTeaser() {
      if (!this.config.teaser.enabled) return;
      if (this.state.isOpen && this.config.teaser.showOnlyWhenClosed) return;
      if (this.state.teaserClosedInSession) return;
      setTimeout(() => {
        if (!this.state.isOpen) this.showTeaser();
      }, this.config.teaser.autoShowDelayMs);
    }

    showTeaser() {
      if (this.els.teaser) this.els.teaser.classList.add("show");
    }
    hideTeaser() {
      if (this.els.teaser) this.els.teaser.classList.remove("show");
    }
    handleTeaserClose(e) {
      e.stopPropagation();
      this.hideTeaser();
      this.state.teaserClosedInSession = true;
    }
    handleTeaserOpen() {
      this.open(true);
      this.hideTeaser();
    }

    handleLauncherClick() {
      this.open(true);
    }
    handleCloseClick() {
      this.close(true);
    }

    open(triggerCallbacks = true) {
      this.state.isOpen = true;
      this.els.root.classList.add("open");
      this.persistState();
      this.hideTeaser();
      requestAnimationFrame(() => {
        this.scrollToBottom();
        this.els.input.focus();
      });
      if (triggerCallbacks && typeof this.config.callbacks.onOpen === "function") {
        this.config.callbacks.onOpen({ sessionId: this.state.sessionId });
      }
    }

    close(triggerCallbacks = true) {
      this.state.isOpen = false;
      this.els.root.classList.remove("open");
      this.persistState();
      if (!this.state.teaserClosedInSession && this.config.teaser.enabled) setTimeout(() => this.showTeaser(), 500);
      if (triggerCallbacks && typeof this.config.callbacks.onClose === "function") {
        this.config.callbacks.onClose({ sessionId: this.state.sessionId });
      }
    }

    setTyping(isTyping) {
      this.state.isTyping = !!isTyping;
      this.els.typingRow.classList.toggle("active", this.state.isTyping);
      if (isTyping) this.scrollToBottom();
    }

    scrollToBottom() {
      if (!this.els.messages) return;
      this.els.messages.scrollTo({
        top: this.els.messages.scrollHeight + 9999,
        behavior: this.config.behavior.autoScrollBehavior || "smooth",
      });
    }

    handleInputKeydown(e) {
      if (!this.config.behavior.sendOnEnter) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendCurrentInput();
      }
    }

    handleSendClick() {
      this.sendCurrentInput();
    }

    async sendCurrentInput() {
      const text = (this.els.input.value || "").trim();
      if (!text) return;
      this.els.input.value = "";
      await this.sendUserMessage(text);
    }

    addMessage({ role, text, timestamp = Utils.nowISO(), id = null, meta = {} }) {
      const message = {
        id: id || `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role,
        text: String(text || ""),
        timestamp,
        meta,
      };
      this.state.messages.push(message);
      this.persistState();
      this.renderMessage(message);
      this.scrollToBottom();
      return message;
    }

    renderMessages() {
      this.els.messages.innerHTML = "";
      this.state.messages.forEach((m) => this.renderMessage(m));
      this.scrollToBottom();
    }

    renderMessage(message) {
      const row = document.createElement("div");
      row.className = `cw-msg-row ${message.role === "user" ? "user" : "bot"}`;
      const time = Utils.formatTime(message.timestamp);

      if (message.role === "bot") {
        row.innerHTML = `
          <img class="cw-avatar" src="${Utils.escapeHTML(this.config.company.logoUrl)}" alt="agent"/>
          <div class="cw-msg-col">
            <div class="cw-bubble">${Utils.escapeHTML(message.text)}</div>
            <div class="cw-time">${Utils.escapeHTML(time)}</div>
          </div>
        `;
      } else {
        row.innerHTML = `
          <div class="cw-msg-col" style="align-items:flex-end">
            <div class="cw-bubble">${Utils.escapeHTML(message.text)}</div>
            <div class="cw-time">${Utils.escapeHTML(time)}</div>
          </div>
        `;
      }
      this.els.messages.appendChild(row);
    }

    async handleWelcomeMessage() {
      if (!this.config.welcome.enabled || this.state.hasShownWelcome) return;
      await Utils.wait(this.config.welcome.delayMs || 300);
      this.addMessage({ role: "bot", text: this.config.welcome.message });
      this.state.hasShownWelcome = true;
      this.persistState();
    }

    buildWebhookPayload(userMessageText) {
      return {
        sessionId: this.state.sessionId,
        message: userMessageText,
        timestamp: Utils.nowISO(),
        route: Utils.getRouteInfo(),
        user: Utils.getUserAgentInfo(),
        metadata: {
          source: this.config.metadata.source,
          version: this.config.metadata.version,
          handoff: this.config.handoff,
          ...this.config.metadata.extra,
        },
        history: this.state.messages.slice(-20).map((m) => ({
          role: m.role,
          text: m.text,
          timestamp: m.timestamp,
        })),
      };
    }

    async sendUserMessage(text) {
      const sent = this.addMessage({ role: "user", text });
      if (typeof this.config.callbacks.onMessageSent === "function") this.config.callbacks.onMessageSent(sent);

      this.els.sendBtn.disabled = true;
      this.setTyping(true);

      const typingDelay =
        Math.floor(
          Math.random() *
            (this.config.behavior.typingIndicatorMaxMs - this.config.behavior.typingIndicatorMinMs + 1)
        ) + this.config.behavior.typingIndicatorMinMs;

      try {
        const payload = this.buildWebhookPayload(text);
        const [response] = await Promise.all([this.webhook.sendMessage(payload), Utils.wait(typingDelay)]);
        const botMsg = this.addMessage({
          role: "bot",
          text: response.text || "Thanks! I got your message.",
          timestamp: response.timestamp || Utils.nowISO(),
          meta: { raw: response },
        });
        this.sound.playNotification();
        if (typeof this.config.callbacks.onMessageReceived === "function") this.config.callbacks.onMessageReceived(botMsg);
      } catch (error) {
        const fallback = this.addMessage({
          role: "bot",
          text: "Sorry — I’m having trouble connecting right now. Please try again in a moment.",
        });
        if (typeof this.config.callbacks.onError === "function") this.config.callbacks.onError(error, fallback);
        console.error("[ChatWidget] Message send failed:", error);
      } finally {
        this.setTyping(false);
        this.els.sendBtn.disabled = false;
        this.els.input.focus();
      }
    }
  }

  class ChatWidgetAPI {
    constructor() {
      this.instance = null;
    }
    init(config = {}) {
      if (this.instance) return this.instance;
      this.instance = new ChatWidget(config);
      this.instance.init();
      return this.instance;
    }
    getInstance() {
      return this.instance;
    }
    open() {
      this.instance?.open(true);
    }
    close() {
      this.instance?.close(true);
    }
    send(text) {
      if (this.instance) this.instance.sendUserMessage(text);
    }
    clearHistory() {
      if (!this.instance) return;
      this.instance.state.messages = [];
      this.instance.persistState();
      this.instance.renderMessages();
    }
  }

  function boot() {
    const config = Utils.getCurrentScriptConfig();
    const api = new ChatWidgetAPI();
    api.init(config);
    window.ChatWidget = api;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();