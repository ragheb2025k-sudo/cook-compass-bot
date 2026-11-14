/* قطب‌نمای آشپزی — live status card for the GitHub Pages landing.
 *
 * Renders the same contract as the dashboard's /api/bot-status route, but the
 * data comes from ./status.json which CI regenerates every 10 minutes
 * (scripts/build-status.mjs). The page re-fetches every 15 seconds so a
 * redeployed snapshot appears quickly; the token never reaches the browser.
 */
(function () {
  "use strict";

  var POLL_INTERVAL_MS = 15000;

  var ICONS = {
    bot:
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
    webhook:
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/></svg>',
    inbox:
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
    alert:
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    check:
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    cpu:
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20v2"/><path d="M12 2v2"/><path d="M17 20v2"/><path d="M17 2v2"/><path d="M2 12h2"/><path d="M2 17h2"/><path d="M2 7h2"/><path d="M20 12h2"/><path d="M20 17h2"/><path d="M20 7h2"/><path d="M7 20v2"/><path d="M7 2v2"/><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>',
    clock:
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6v6h4"/><circle cx="12" cy="12" r="10"/></svg>',
    refresh:
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  };

  var FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

  var bodyEl = document.getElementById("status-body");
  var dotEl = document.getElementById("status-dot");
  var refreshBtn = document.getElementById("status-refresh");

  var loading = true;
  var lastData = null;
  var lastChecked = null;
  var lastError = null;
  var now = Date.now();

  function toFa(value) {
    return String(value).replace(/[0-9]/g, function (d) {
      return FA_DIGITS[Number(d)];
    });
  }

  function relativeFa(fromMs, nowMs) {
    if (nowMs === null) return "همین حالا";
    var seconds = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
    if (seconds < 10) return "همین حالا";
    if (seconds < 60) return toFa(seconds) + " ثانیه پیش";
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return toFa(minutes) + " دقیقه پیش";
    return toFa(Math.floor(minutes / 60)) + " ساعت پیش";
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function row(icon, label, warn, valueHtml) {
    return (
      '<div class="status-row">' +
      '<span class="status-ico' + (warn ? " warn" : "") + '">' + icon + "</span>" +
      '<span class="status-label">' + label + "</span>" +
      '<div class="status-val">' + valueHtml + "</div>" +
      "</div>"
    );
  }

  function setDot(healthy) {
    if (!dotEl) return;
    dotEl.innerHTML = healthy
      ? '<span class="ping"></span><span class="dot dot-emerald"></span>'
      : '<span class="dot dot-amber"></span>';
  }

  function skeletonHtml() {
    return (
      '<div class="skeleton-stack" aria-hidden="true">' +
      '<div class="skeleton-row"><span class="sk sk-sq"></span><span class="sk sk-w24"></span><span class="sk sk-w32"></span></div>' +
      '<span class="sk sk-line"></span>' +
      '<span class="sk sk-line sk-80"></span>' +
      '<span class="sk sk-line sk-60"></span>' +
      '<span class="sk sk-line sk-66"></span>' +
      '<span class="sr-only">در حال دریافت وضعیت ربات…</span>' +
      "</div>"
    );
  }

  function failBox(message, retryable) {
    var btn = retryable
      ? '<button class="btn btn-sm" type="button" data-retry> ' +
        ICONS.refresh + " تلاش دوباره</button>"
      : "";
    return (
      '<div class="notice">' + ICONS.alert +
      '<div><p class="notice-title">وضعیت زنده در دسترس نیست</p>' +
      '<p class="notice-text">' + esc(message) + ". بعداً دوباره تلاش می‌کنیم.</p>" +
      btn + "</div></div>"
    );
  }

  function render() {
    if (!bodyEl) return;

    if (loading && !lastData) {
      bodyEl.innerHTML = skeletonHtml();
      return;
    }

    if (!lastData) {
      bodyEl.innerHTML = failBox(
        "دریافت اطلاعات ناموفق بود" + (lastError ? " (" + esc(lastError) + ")" : ""),
        true,
      );
      bindRetry();
      setDot(false);
      return;
    }

    var d = lastData;
    var html = "";

    if (!d.ok) {
      html +=
        '<div class="notice" role="status">' + ICONS.alert +
        '<div><p class="notice-title">وضعیت ربات در دسترس نیست</p>' +
        '<p class="notice-text">' + esc(d.reason || "دلیل نامشخص") + "</p></div></div>";
    } else if (lastError) {
      html +=
        '<div class="notice-inline">' + ICONS.alert +
        "<span>به‌روزرسانی دوره‌ای ناموفق بود (" + esc(lastError) +
        ") — اطلاعات ممکن است کمی قدیمی باشند.</span></div>";
    }

    var webhook = d.webhook || null;
    var pending = webhook ? webhook.pendingUpdateCount : 0;
    var healthy = Boolean(d.ok && webhook && webhook.url && pending <= 3);

    /* --- bot --- */
    html += row(
      ICONS.bot,
      "ربات",
      false,
      d.bot
        ? '<span class="badge badge-mono">@' + esc(d.bot.username) + "</span>" +
          '<span>' + esc(d.bot.firstName) + "</span>"
        : '<span class="muted">در دسترس نیست</span>',
    );

    /* --- webhook --- */
    var webhookVal;
    if (!webhook) {
      webhookVal = '<span class="muted">اطلاعات وب‌هوک در دسترس نیست</span>';
    } else {
      webhookVal = healthy
        ? '<span class="badge badge-emerald" aria-live="polite">' + ICONS.check + " متصل و همگام</span>"
        : webhook.url
          ? '<span class="badge badge-amber">در صف پردازش</span>'
          : '<span class="badge badge-amber">وب‌هوک تنظیم نشده</span>';
      if (webhook.url) {
        webhookVal +=
          '<span class="url" title="' + esc(webhook.url) + '">' + esc(webhook.url) + "</span>";
      }
      if (webhook.isTgcloud && webhook.url) {
        webhookVal += '<span class="badge badge-stone">زیرساخت تلگرام</span>';
      }
    }
    html += row(ICONS.webhook, "وب‌هوک", !healthy, webhookVal);

    /* --- pending queue --- */
    html += row(
      ICONS.inbox,
      "صف پیام‌ها",
      false,
      webhook
        ? '<span class="badge ' +
          (pending === 0 ? "badge-emerald" : "badge-amber") +
          '">' + toFa(pending) + " پیام در انتظار</span>"
        : '<span class="muted">—</span>',
    );

    /* --- last webhook error --- */
    if (webhook && webhook.lastErrorMessage) {
      var errHtml =
        "<span>" + esc(webhook.lastErrorMessage) + "</span>";
      if (webhook.lastErrorDate) {
        errHtml +=
          '<span class="muted">(' +
          relativeFa(webhook.lastErrorDate * 1000, now) +
          ")</span>";
      }
      html += row(ICONS.alert, "آخرین خطا", true, errHtml);
    }

    /* --- AI engine --- */
    html += row(
      ICONS.cpu,
      "موتور پیشنهاد",
      false,
      d.ai
        ? "<span>" + esc(d.ai.provider) + "</span>" +
          '<span class="badge badge-stone">' + esc(d.ai.model) + "</span>" +
          (d.ai.mockAvailable ? '<span class="badge badge-stone">حالت آزمایشی موجود</span>' : "")
        : '<span class="muted">اطلاعات موتور در دسترس نیست</span>',
    );

    html +=
      '<div class="status-meta">' +
      "<span>" + ICONS.clock + " آخرین بررسی: " +
      (lastChecked ? relativeFa(lastChecked, now) : "—") +
      "</span>" +
      "<span>به‌روزرسانی خودکار هر ۱۵ ثانیه · داده هر ۱۰ دقیقه توسط CI بازسازی می‌شود</span>" +
      "</div>";

    bodyEl.innerHTML = html;
    setDot(healthy);
    bindRetry();
  }

  function bindRetry() {
    var btn = bodyEl.querySelector("[data-retry]");
    if (btn) {
      btn.addEventListener("click", function () {
        load();
      });
    }
  }

  function load() {
    loading = true;
    if (refreshBtn) {
      refreshBtn.disabled = true;
      var svg = refreshBtn.querySelector("svg");
      if (svg) svg.classList.add("spin");
    }
    render();

    fetch("status.json?ts=" + Date.now(), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("کد وضعیت " + res.status);
        return res.json();
      })
      .then(function (json) {
        lastData = json;
        lastChecked = Date.now();
        lastError = null;
      })
      .catch(function (e) {
        lastError = e && e.message ? e.message : "خطای نامشخص";
        if (!lastData) lastData = null;
      })
      .then(function () {
        loading = false;
        if (refreshBtn) {
          refreshBtn.disabled = false;
          var svg = refreshBtn.querySelector("svg");
          if (svg) svg.classList.remove("spin");
        }
        render();
      });
  }

  /* init */
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      load();
    });
  }

  load();
  setInterval(load, POLL_INTERVAL_MS);
  setInterval(function () {
    now = Date.now();
    if (lastData) render();
  }, 1000);
})();
