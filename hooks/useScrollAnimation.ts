import { useEffect } from "react";

export const useScrollAnimation = (skipAnimations: boolean = false) => {
  useEffect(() => {
    // If returning home, show everything immediately WITHOUT delay
    if (skipAnimations) {
      const elements = document.querySelectorAll("[data-scroll-animate]");
      console.log(
        "⚡ INSTANT: Showing all elements immediately (returning home)",
      );
      console.log("⚡ Found elements:", elements.length);
      elements.forEach((element) => {
        element.classList.add("animate-in");
      });
      return;
    }

    // Otherwise, wait for React to render then use scroll-based animations
    setTimeout(() => {
      const elements = document.querySelectorAll("[data-scroll-animate]");

      console.log("🎬 Found elements:", elements.length);
      console.log("🔄 Skip animations:", skipAnimations);

      elements.forEach((el, i) => {
        console.log(`  ${i + 1}.`, el.className);
      });

      if (elements.length === 0) {
        console.warn("⚠️ No elements with data-scroll-animate found!");
        return;
      }

      // Use scroll-based animations
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              console.log("✨ Animating:", entry.target.className);
              entry.target.classList.add("animate-in");
              observer.unobserve(entry.target);
            }
          });
        },
        {
          threshold: 0.15,
          rootMargin: "0px 0px -100px 0px",
        },
      );

      elements.forEach((element) => {
        // Check if element is already in viewport on page load
        const rect = element.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
        
        // If element is in viewport on load, animate it after a short delay
        // Otherwise, observe it for scroll-based animation
        if (isInViewport && window.scrollY < 100) {
          // Near top of page - animate immediately
          setTimeout(() => {
            element.classList.add("animate-in");
          }, 200);
        } else {
          // Not in viewport or scrolled down - use observer
          observer.observe(element);
        }
      });

      console.log("✅ Observing", elements.length, "elements");

      return () => {
        observer.disconnect();
      };
    }, 100);

    return () => {};
  }, [skipAnimations]);
};
