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
