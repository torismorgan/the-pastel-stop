(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -------------------------------------------------
     Sticky header
  ------------------------------------------------- */
  var header = document.getElementById("site-header");
  var STICK_AT = 48;

  function updateHeader() {
    var scrolled = window.scrollY > STICK_AT;
    header.classList.toggle("is-scrolled", scrolled);
  }

  var ticking = false;
  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          updateHeader();
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true }
  );
  updateHeader();

  /* -------------------------------------------------
     Mobile nav
  ------------------------------------------------- */
  var menuToggle = document.getElementById("menu-toggle");
  var mobileNav = document.getElementById("mobile-nav");

  function closeMenu() {
    mobileNav.classList.remove("is-open");
    header.classList.remove("nav-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open menu");
  }

  function openMenu() {
    mobileNav.classList.add("is-open");
    header.classList.add("nav-open");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Close menu");
  }

  menuToggle.addEventListener("click", function () {
    var isOpen = mobileNav.classList.contains("is-open");
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  mobileNav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", closeMenu);
  });

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && mobileNav.classList.contains("is-open")) {
      closeMenu();
      menuToggle.focus();
    }
  });

  /* -------------------------------------------------
     Hero carousel (homepage only)
  ------------------------------------------------- */
  var hero = document.getElementById("hero");
  if (hero) {
    var slides = Array.prototype.slice.call(hero.querySelectorAll(".hero__slide"));
    var dots = Array.prototype.slice.call(hero.querySelectorAll(".hero__dot"));
    var currentIndex = 0;
    var autoplayId = null;
    var AUTOPLAY_DELAY = 7000;

    var goToSlide = function (index) {
      if (index === currentIndex) return;
      currentIndex = (index + slides.length) % slides.length;

      slides.forEach(function (slide, i) {
        slide.classList.toggle("is-active", i === currentIndex);
      });
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === currentIndex);
        dot.setAttribute("aria-selected", i === currentIndex ? "true" : "false");
      });
    };

    var nextSlide = function () {
      goToSlide(currentIndex + 1);
    };

    var stopAutoplay = function () {
      if (autoplayId) {
        clearInterval(autoplayId);
        autoplayId = null;
      }
    };

    var startAutoplay = function () {
      if (reducedMotion || slides.length < 2) return;
      stopAutoplay();
      autoplayId = setInterval(nextSlide, AUTOPLAY_DELAY);
    };

    var manualAdvance = function (fn) {
      stopAutoplay();
      fn();
      startAutoplay(); // restart the timer so the next auto-advance is a full 7s after a click
    };

    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        manualAdvance(function () {
          goToSlide(parseInt(dot.getAttribute("data-goto"), 10));
        });
      });
    });

    hero.addEventListener("click", function (e) {
      if (e.target.closest("a, button")) return;
      manualAdvance(nextSlide);
    });

    hero.setAttribute("tabindex", "0");
    hero.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") {
        manualAdvance(nextSlide);
      } else if (e.key === "ArrowLeft") {
        manualAdvance(function () {
          goToSlide(currentIndex - 1);
        });
      }
    });

    var touchStartX = null;
    hero.addEventListener(
      "touchstart",
      function (e) {
        touchStartX = e.changedTouches[0].clientX;
      },
      { passive: true }
    );

    hero.addEventListener(
      "touchend",
      function (e) {
        if (touchStartX === null) return;
        var deltaX = e.changedTouches[0].clientX - touchStartX;
        var SWIPE_THRESHOLD = 40;
        if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
          manualAdvance(function () {
            goToSlide(deltaX < 0 ? currentIndex + 1 : currentIndex - 1);
          });
        }
        touchStartX = null;
      },
      { passive: true }
    );

    startAutoplay();
    hero.addEventListener("mouseenter", stopAutoplay);
    hero.addEventListener("mouseleave", startAutoplay);
  }

  /* -------------------------------------------------
     Dear Her envelope (dear-her.html) — click to open
  ------------------------------------------------- */
  var envelope = document.getElementById("envelope");
  if (envelope) {
    var openEnvelope = function () {
      if (envelope.classList.contains("is-open")) return;
      envelope.classList.add("is-open");
      envelope.removeAttribute("role");
      envelope.removeAttribute("aria-label");
      envelope.tabIndex = -1;
    };
    envelope.addEventListener("click", openEnvelope);
    envelope.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openEnvelope();
      }
    });
  }

  /* -------------------------------------------------
     Letters filter pills (dear-her.html)
  ------------------------------------------------- */
  var letterFilters = document.querySelectorAll(".letters-filter");
  letterFilters.forEach(function (filter) {
    filter.addEventListener("click", function () {
      letterFilters.forEach(function (f) {
        f.classList.remove("is-active");
      });
      filter.classList.add("is-active");
    });
  });

  /* Mobile: tags collapse behind a filter icon */
  var filterToggle = document.getElementById("filter-toggle");
  var filterPanel = document.getElementById("letters-filters");
  if (filterToggle && filterPanel) {
    filterToggle.addEventListener("click", function () {
      var isOpen = filterPanel.classList.toggle("is-open");
      filterToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      if (isOpen) filterPanel.classList.add("is-revealed");
    });
    letterFilters.forEach(function (filter) {
      filter.addEventListener("click", function () {
        filterPanel.classList.remove("is-open");
        filterToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* -------------------------------------------------
     Letters featured list (dear-her.html) — hover to
     highlight an entry and swap the featured image
  ------------------------------------------------- */
  var featuredList = document.querySelector(".letters-featured__list");
  var featuredImageWrap = document.querySelector(".letters-featured__image");
  var featuredImage = document.getElementById("letters-featured-img");
  if (featuredList && featuredImageWrap && featuredImage) {
    var featuredItems = Array.prototype.slice.call(
      featuredList.querySelectorAll(".letters-featured__item")
    );

    var setActiveItem = function (item) {
      featuredItems.forEach(function (i) {
        i.classList.toggle("is-active", i === item);
      });
      var nextSrc = item.getAttribute("data-image");
      if (!nextSrc || nextSrc === featuredImage.getAttribute("src")) return;
      if (reducedMotion) {
        featuredImage.setAttribute("src", nextSrc);
        return;
      }
      featuredImageWrap.classList.add("is-swapping");
      window.setTimeout(function () {
        featuredImage.setAttribute("src", nextSrc);
        featuredImageWrap.classList.remove("is-swapping");
      }, 220);
    };

    featuredItems.forEach(function (item) {
      item.addEventListener("mouseenter", function () {
        setActiveItem(item);
      });
      item.addEventListener("focus", function () {
        setActiveItem(item);
      });
    });

    featuredList.addEventListener("mouseleave", function () {
      setActiveItem(featuredItems[0]);
    });
  }

  /* -------------------------------------------------
     Footer newsletter form
  ------------------------------------------------- */
  var newsletterForm = document.querySelector(".site-footer__form");
  if (newsletterForm) {
    newsletterForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var wrap = newsletterForm.querySelector(".site-footer__input-wrap");
      var checkbox = newsletterForm.querySelector(".site-footer__checkbox");
      var message = document.createElement("p");
      message.className = "site-footer__form-success";
      message.textContent = "You're on the list — welcome to the Stop.";
      wrap.replaceWith(message);
      if (checkbox) checkbox.remove();
    });
  }

  /* -------------------------------------------------
     Scroll reveal
     - [data-reveal-group] observes as a unit; when it enters the
       viewport, its [data-reveal] children reveal together with a
       staggered transition-delay (data-reveal-stagger, ms).
     - Any other .js-reveal element (not inside a group) reveals on
       its own the moment it enters the viewport.
     - Everything reveals once; already-revealed elements are
       unobserved so scrolling back up never replays them.
  ------------------------------------------------- */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealGroups = document.querySelectorAll("[data-reveal-group]");
  var revealSingles = document.querySelectorAll(".js-reveal:not([data-reveal])");

  if (!reduceMotion && "IntersectionObserver" in window) {
    var groupObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var group = entry.target;
          var stagger = parseInt(group.getAttribute("data-reveal-stagger"), 10) || 100;
          var children = group.querySelectorAll("[data-reveal]");
          children.forEach(function (child, i) {
            child.style.transitionDelay = i * stagger + "ms";
            child.classList.add("is-revealed");
            child.addEventListener(
              "transitionend",
              function () {
                child.style.transitionDelay = "";
              },
              { once: true }
            );
          });
          groupObserver.unobserve(group);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    revealGroups.forEach(function (group) {
      groupObserver.observe(group);
    });

    var singleObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            singleObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    revealSingles.forEach(function (el) {
      singleObserver.observe(el);
    });
  } else {
    document.querySelectorAll(".js-reveal, [data-reveal]").forEach(function (el) {
      el.classList.add("is-revealed");
    });
  }
})();

/* Recap page: polaroids appear one by one (hover takes over after) */
(function () {
  var grid = document.querySelector("[data-pola-anim]");
  if (!grid) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  var items = grid.querySelectorAll(".rc-polas__item");
  items.forEach(function (el, i) { el.style.setProperty("--i", i); });
  grid.style.setProperty("--n", items.length);
  grid.classList.add("is-armed");
  var io = new IntersectionObserver(
    function (entries) {
      if (entries[0].isIntersecting) {
        grid.classList.add("is-playing");
        io.disconnect();
      }
    },
    { threshold: 0.12 }
  );
  io.observe(grid);
})();

/* -------------------------------------------------
   "Join the Stop" signup modal (every page)
   - Any "Join the Stop" link opens it right away.
   - It also opens once on its own, after the visitor has seen 2+ pages this
     visit AND scrolled ~38% down the page. Only once per visit, and never again
     after they sign up.
------------------------------------------------- */
(function () {
  "use strict";

  /* Where sign-ups are sent. Leave empty until an email service (Mailchimp, Klaviyo,
     Formspree, etc.) is connected: with it empty the form only shows the success
     message and nothing is stored anywhere. */
  var SIGNUP_ENDPOINT = "";

  var SCROLL_TRIGGER = 0.38;
  var MIN_PAGES = 2;
  var CLOSE_MS = 240;

  function storage(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }
  function read(kind, key) {
    try { var s = storage(kind); return s ? s.getItem(key) : null; } catch (e) { return null; }
  }
  function write(kind, key, value) {
    try { var s = storage(kind); if (s) s.setItem(key, value); } catch (e) {}
  }

  var K_PAGES = "tps_pageviews";
  var K_AUTO_SHOWN = "tps_join_auto_shown";
  var K_JOINED = "tps_joined";

  /* count this page view for the current visit */
  var pageViews = (parseInt(read("sessionStorage", K_PAGES), 10) || 0) + 1;
  write("sessionStorage", K_PAGES, String(pageViews));

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var root = document.createElement("div");
  root.className = "join-modal";
  root.id = "join-modal";
  root.hidden = true;
  root.innerHTML =
    '<div class="join-modal__backdrop" data-join-close></div>' +
    '<div class="join-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="join-modal-title" tabindex="-1">' +
      '<button class="join-modal__close" type="button" aria-label="Close" data-join-close>&times;</button>' +
      '<div class="join-modal__media"><img src="asset/waitlist-photo.jpg" alt="" width="1024" height="1536"></div>' +
      '<div class="join-modal__panel">' +
        '<div class="join-modal__state" data-state="form">' +
          '<h2 class="join-modal__title" id="join-modal-title">join the stop.</h2>' +
          '<p class="join-modal__kicker">come sit with us.</p>' +
          '<p class="join-modal__body">stories, events, little life updates &mdash; and whatever we&rsquo;re figuring out in between.</p>' +
          '<form class="join-modal__form" novalidate>' +
            '<label class="visually-hidden" for="join-modal-email">Email address</label>' +
            '<input class="join-modal__input" id="join-modal-email" type="email" name="email" placeholder="your email" autocomplete="email" inputmode="email" required>' +
            '<p class="join-modal__error" role="alert" hidden></p>' +
            '<button class="join-modal__submit" type="submit">Save me a seat &rarr;</button>' +
          '</form>' +
          '<p class="join-modal__note">no spam. just the good stuff.</p>' +
        '</div>' +
        '<div class="join-modal__state" data-state="success" hidden>' +
          '<h2 class="join-modal__title">you&rsquo;re in.</h2>' +
          '<p class="join-modal__kicker">saved you a seat.</p>' +
          '<p class="join-modal__body">thank you for joining the stop. keep an eye on your inbox &mdash; stories, events and little life updates are on their way.</p>' +
          '<p class="join-modal__note">see you at the next stop. &hearts;</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(root);

  var dialog = root.querySelector(".join-modal__dialog");
  var form = root.querySelector(".join-modal__form");
  var input = root.querySelector(".join-modal__input");
  var errorEl = root.querySelector(".join-modal__error");
  var submitBtn = root.querySelector(".join-modal__submit");
  var formState = root.querySelector('[data-state="form"]');
  var successState = root.querySelector('[data-state="success"]');
  var lastFocus = null;
  var closeTimer = null;
  var isOpen = false;

  function focusables() {
    return Array.prototype.slice.call(
      dialog.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')
    ).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    clearTimeout(closeTimer);
    lastFocus = document.activeElement;
    root.hidden = false;
    document.documentElement.classList.add("join-modal-open");
    // next frame so the fade/scale transition plays
    requestAnimationFrame(function () {
      root.classList.add("is-open");
    });
    var coarse = window.matchMedia("(pointer: coarse)").matches;
    var showingForm = !formState.hidden;
    setTimeout(function () {
      (showingForm && !coarse ? input : dialog).focus();
    }, reduceMotion ? 0 : 60);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove("is-open");
    document.documentElement.classList.remove("join-modal-open");
    closeTimer = setTimeout(function () {
      root.hidden = true;
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }, reduceMotion ? 0 : CLOSE_MS);
  }

  /* close: x button, click outside, Escape */
  root.addEventListener("click", function (e) {
    if (e.target.closest("[data-join-close]")) close();
  });
  document.addEventListener("keydown", function (e) {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      var els = focusables();
      if (!els.length) return;
      var first = els[0], last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  });

  /* manual trigger: any "Join the Stop" link or [data-join-modal] element */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("a, button");
    if (!el || el.closest(".join-modal")) return;
    var isJoinLink =
      el.hasAttribute("data-join-modal") ||
      (el.tagName === "A" &&
        /join the stop/i.test(el.textContent) &&
        (!el.getAttribute("href") || el.getAttribute("href") === "#"));
    if (!isJoinLink) return;
    e.preventDefault();
    open();
  });

  /* submit */
  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
    input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function showSuccess() {
    write("localStorage", K_JOINED, "1");
    formState.hidden = true;
    successState.hidden = false;
    dialog.focus();
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      showError("please enter a valid email.");
      input.focus();
      return;
    }
    showError("");
    submitBtn.disabled = true;
    var label = submitBtn.innerHTML;
    submitBtn.textContent = "Saving\u2026";

    if (!SIGNUP_ENDPOINT) {
      if (window.console) console.warn("[TPS] Signup form is not connected to an email service yet: nothing was saved.");
      submitBtn.disabled = false;
      submitBtn.innerHTML = label;
      showSuccess();
      return;
    }
    fetch(SIGNUP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: email, source: location.pathname })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        submitBtn.disabled = false;
        submitBtn.innerHTML = label;
        showSuccess();
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.innerHTML = label;
        showError("something went wrong. please try again.");
      });
  });
  input.addEventListener("input", function () { if (!errorEl.hidden) showError(""); });

  /* automatic discovery popup */
  var alreadyJoined = read("localStorage", K_JOINED) === "1";
  var alreadyShown = read("sessionStorage", K_AUTO_SHOWN) === "1";
  if (!alreadyJoined && !alreadyShown && pageViews >= MIN_PAGES) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var doc = document.documentElement;
        var range = doc.scrollHeight - window.innerHeight;
        if (range < 300) return; // page too short to measure engagement
        var progress = (window.pageYOffset || doc.scrollTop) / range;
        if (progress >= SCROLL_TRIGGER && !isOpen) {
          write("sessionStorage", K_AUTO_SHOWN, "1");
          window.removeEventListener("scroll", onScroll);
          var nav = document.getElementById("mobile-nav");
          if (nav && nav.classList.contains("is-open")) return;
          open();
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  }
})();
