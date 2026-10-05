/**
 * WebChat widget: safe URL / markdown-link detection for plain-text messages.
 * Exposed as globalThis.WebchatLinkify in the browser; CommonJS for tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WebchatLinkify = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function webchatLinkifyFactory() {
  'use strict';

  var TRAILING_SAFE = /[.,;:!?]+$/;

  function stripTrailingPunctuation(raw) {
    var s = String(raw || '');
    var m = s.match(TRAILING_SAFE);
    if (m) s = s.slice(0, -m[0].length);
    return s;
  }

  /**
   * Returns a safe href for <a> or null if untrusted / invalid.
   * Allows http, https, mailto, tel only.
   */
  function normalizeUrlForHref(raw) {
    if (raw == null) return null;
    var s = stripTrailingPunctuation(String(raw).trim());
    if (!s) return null;
    if (/^www\./i.test(s)) s = 'https://' + s;
    try {
      var u = new URL(s);
      var p = u.protocol.toLowerCase();
      if (p === 'http:' || p === 'https:') {
        return u.href;
      }
      if (p === 'mailto:') {
        var path = u.pathname || '';
        if (!path || path.indexOf('@') === -1) return null;
        return u.href.slice(0, 4096);
      }
      if (p === 'tel:') {
        var rawTel = s.replace(/^tel:/i, '').trim();
        try {
          rawTel = decodeURIComponent(rawTel);
        } catch (e2) {
          /* keep rawTel */
        }
        var body = rawTel.replace(/[^\d+\s().-]/g, '');
        if ((body.replace(/\D/g, '') || '').length < 3) return null;
        return 'tel:' + body.trim().slice(0, 80);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // Markdown: [label](url) — url must pass normalizeUrlForHref
  var MD_LINK_RE = /\[([^\]]*)\]\(\s*(https?:\/\/[^)\s]+|mailto:[^)\s]+|tel:[^)\s]+)\s*\)/gi;

  // Bare URLs (avoid < to reduce HTML injection overlap; whitespace ends match)
  var BARE_URL_RE = /https?:\/\/[^\s<]+|www\.[^\s<]+|mailto:[^\s<]+|tel:[+\d][^\s<]*/gi;

  function splitWithMarkdown(text) {
    var parts = [];
    var last = 0;
    var m;
    MD_LINK_RE.lastIndex = 0;
    while ((m = MD_LINK_RE.exec(text)) !== null) {
      if (m.index > last) {
        parts.push({ type: 'text', text: text.slice(last, m.index) });
      }
      var href = normalizeUrlForHref(m[2]);
      if (href) {
        parts.push({ type: 'link', href: href, label: m[1] != null && m[1] !== '' ? String(m[1]) : href });
      } else {
        parts.push({ type: 'text', text: m[0] });
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      parts.push({ type: 'text', text: text.slice(last) });
    }
    if (parts.length === 0) {
      parts.push({ type: 'text', text: text });
    }
    return parts;
  }

  function splitBareUrlsInText(segment) {
    var text = String(segment);
    var out = [];
    var last = 0;
    var m;
    BARE_URL_RE.lastIndex = 0;
    while ((m = BARE_URL_RE.exec(text)) !== null) {
      if (m.index > last) {
        out.push({ type: 'text', text: text.slice(last, m.index) });
      }
      var raw = stripTrailingPunctuation(m[0]);
      var href = normalizeUrlForHref(raw);
      if (href) {
        out.push({ type: 'link', href: href, label: raw });
      } else {
        out.push({ type: 'text', text: m[0] });
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      out.push({ type: 'text', text: text.slice(last) });
    }
    if (out.length === 0) {
      out.push({ type: 'text', text: text });
    }
    return out;
  }

  function parseMessageToParts(text) {
    if (text == null) return [];
    var mdParts = splitWithMarkdown(String(text));
    var flat = [];
    for (var i = 0; i < mdParts.length; i++) {
      if (mdParts[i].type === 'link') {
        flat.push(mdParts[i]);
      } else {
        var sub = splitBareUrlsInText(mdParts[i].text);
        for (var j = 0; j < sub.length; j++) flat.push(sub[j]);
      }
    }
    return flat;
  }

  function appendRichText(el, text) {
    if (text == null || text === '') return;
    var parts = parseMessageToParts(text);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.type === 'text') {
        el.appendChild(document.createTextNode(p.text));
      } else if (p.type === 'link' && p.href) {
        var a = document.createElement('a');
        a.href = p.href;
        a.textContent = p.label != null ? String(p.label) : p.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'pc-msg-link';
        el.appendChild(a);
      }
    }
  }

  return {
    normalizeUrlForHref: normalizeUrlForHref,
    parseMessageToParts: parseMessageToParts,
    appendRichText: appendRichText
  };
});
