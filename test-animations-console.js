// ============================================
// SCROLL ANIMATION TEST SCRIPT
// ============================================
// Paste this entire script into your browser console
// to diagnose and test scroll animations
// ============================================

console.clear();
console.log('%c🎬 ANIMATION TEST SCRIPT STARTING...', 'font-size: 16px; font-weight: bold; color: #60a5fa;');
console.log('');

// ============================================
// 1. CHECK BROWSER SUPPORT
// ============================================
console.log('%c1️⃣ BROWSER SUPPORT CHECK', 'font-size: 14px; font-weight: bold; color: #34d399;');
console.log('   IntersectionObserver:', 'IntersectionObserver' in window ? '✅ Supported' : '❌ NOT SUPPORTED');
console.log('   Browser:', navigator.userAgent.split(' ').slice(-2).join(' '));
console.log('');

// ============================================
// 2. CHECK FOR ANIMATION ELEMENTS
// ============================================
console.log('%c2️⃣ ANIMATION ELEMENTS CHECK', 'font-size: 14px; font-weight: bold; color: #34d399;');
const animationElements = document.querySelectorAll(
  '.scroll-animate, .scroll-fade-left, .scroll-fade-right, .scroll-scale, .scroll-blur, .scroll-reveal, .scroll-rotate, .scroll-stagger'
);

console.log(`   Found ${animationElements.length} elements with animation classes`);

if (animationElements.length === 0) {
  console.log('%c   ⚠️ WARNING: No animation elements found!', 'color: #fbbf24;');
  console.log('   Possible reasons:');
  console.log('   - You are not on the HOME page');
  console.log('   - You are in Teacher/Storyteller interface');
  console.log('   - React has not finished rendering yet');
} else {
  console.log('   Elements found:');
  const breakdown = {};
  animationElements.forEach(el => {
    const classes = el.className.split(' ').filter(c => c.startsWith('scroll-'));
    classes.forEach(c => {
      breakdown[c] = (breakdown[c] || 0) + 1;
    });
  });
  Object.entries(breakdown).forEach(([className, count]) => {
    console.log(`      ${className}: ${count}`);
  });
}
console.log('');

// ============================================
// 3. CHECK CSS LOADING
// ============================================
console.log('%c3️⃣ CSS LOADING CHECK', 'font-size: 14px; font-weight: bold; color: #34d399;');
if (animationElements.length > 0) {
  const testEl = animationElements[0];
  const styles = window.getComputedStyle(testEl);
  const opacity = styles.opacity;
  const transform = styles.transform;

  console.log(`   Initial opacity: ${opacity} (should be "0")`);
  console.log(`   Initial transform: ${transform}`);

  if (opacity === '0' || parseFloat(opacity) < 0.1) {
    console.log('   ✅ CSS animations are loaded correctly');
  } else {
    console.log('%c   ❌ CSS might not be loaded correctly', 'color: #ef4444;');
  }
} else {
  console.log('   ⚠️ Cannot check CSS - no elements found');
}
console.log('');

// ============================================
// 4. CHECK VISIBLE STATE
// ============================================
console.log('%c4️⃣ VISIBILITY STATE CHECK', 'font-size: 14px; font-weight: bold; color: #34d399;');
const visibleElements = document.querySelectorAll('.is-visible');
console.log(`   Elements with "is-visible" class: ${visibleElements.length}`);

if (animationElements.length > 0) {
  const percentage = Math.round((visibleElements.length / animationElements.length) * 100);
  console.log(`   Animation progress: ${percentage}%`);
}
console.log('');

// ============================================
// 5. VIEWPORT CHECK
// ============================================
console.log('%c5️⃣ VIEWPORT ANALYSIS', 'font-size: 14px; font-weight: bold; color: #34d399;');
console.log(`   Window height: ${window.innerHeight}px`);
console.log(`   Scroll position: ${window.scrollY}px`);

let inViewport = 0;
animationElements.forEach(el => {
  const rect = el.getBoundingClientRect();
  if (rect.top < window.innerHeight && rect.bottom > 0) {
    inViewport++;
  }
});
console.log(`   Elements currently in viewport: ${inViewport}`);
console.log('');

// ============================================
// 6. FORCE ANIMATION TEST
// ============================================
console.log('%c6️⃣ FORCE ANIMATION TEST', 'font-size: 14px; font-weight: bold; color: #f59e0b;');
console.log('   This will force ALL elements to animate immediately...');

let forcedCount = 0;
animationElements.forEach(el => {
  if (!el.classList.contains('is-visible')) {
    el.classList.add('is-visible');
    forcedCount++;
  }
});

console.log(`   ✨ Forced animation on ${forcedCount} elements`);
console.log('');

if (forcedCount > 0) {
  console.log('%c   ✅ If elements moved/faded in, animations ARE working!', 'color: #10b981; font-weight: bold;');
  console.log('   The issue is likely with the IntersectionObserver not triggering.');
} else if (animationElements.length > 0) {
  console.log('   ℹ️ All elements were already visible');
} else {
  console.log('%c   ❌ No elements to animate', 'color: #ef4444;');
}
console.log('');

// ============================================
// 7. RESET FUNCTION
// ============================================
console.log('%c7️⃣ UTILITY FUNCTIONS', 'font-size: 14px; font-weight: bold; color: #8b5cf6;');
console.log('   Run these commands to test further:');
console.log('');
console.log('   %cwindow.resetAnimations()', 'color: #60a5fa; font-family: monospace;');
console.log('   - Removes all "is-visible" classes (resets animations)');
console.log('');
console.log('   %cwindow.forceAnimations()', 'color: #60a5fa; font-family: monospace;');
console.log('   - Forces all animations to fire immediately');
console.log('');
console.log('   %cwindow.logAnimationState()', 'color: #60a5fa; font-family: monospace;');
console.log('   - Shows current animation state');
console.log('');

// Define utility functions
window.resetAnimations = function() {
  const elements = document.querySelectorAll('.is-visible');
  elements.forEach(el => el.classList.remove('is-visible'));
  console.log(`✅ Reset ${elements.length} animations`);
  return elements.length;
};

window.forceAnimations = function() {
  const elements = document.querySelectorAll(
    '.scroll-animate, .scroll-fade-left, .scroll-fade-right, .scroll-scale, .scroll-blur, .scroll-reveal, .scroll-rotate, .scroll-stagger'
  );
  let count = 0;
  elements.forEach(el => {
    if (!el.classList.contains('is-visible')) {
      el.classList.add('is-visible');
      count++;
    }
  });
  console.log(`✨ Forced ${count} animations`);
  return count;
};

window.logAnimationState = function() {
  const total = document.querySelectorAll(
    '.scroll-animate, .scroll-fade-left, .scroll-fade-right, .scroll-scale, .scroll-blur, .scroll-reveal, .scroll-rotate, .scroll-stagger'
  ).length;
  const visible = document.querySelectorAll('.is-visible').length;
  console.log(`Animation State: ${visible}/${total} elements visible (${Math.round(visible/total*100)}%)`);
  return { total, visible };
};

// ============================================
// 8. SUMMARY
// ============================================
console.log('%c═══════════════════════════════════════', 'color: #6b7280;');
console.log('%c📊 SUMMARY', 'font-size: 14px; font-weight: bold; color: #60a5fa;');
console.log(`   Total animation elements: ${animationElements.length}`);
console.log(`   Currently visible: ${visibleElements.length}`);
console.log(`   In viewport: ${inViewport}`);
console.log(`   Forced to animate: ${forcedCount}`);
console.log('');

if (animationElements.length === 0) {
  console.log('%c⚠️ ACTION REQUIRED:', 'font-weight: bold; color: #fbbf24;');
  console.log('   1. Make sure you are on the HOME page (not Image Describe section)');
  console.log('   2. Refresh the page if needed');
  console.log('   3. Run this script again after navigation');
} else if (forcedCount > 0) {
  console.log('%c✅ ANIMATIONS ARE WORKING!', 'font-weight: bold; color: #10b981;');
  console.log('   The animation system is functional.');
  console.log('   If you saw elements move, the CSS and JS are working correctly.');
  console.log('   The IntersectionObserver might need tuning.');
} else {
  console.log('%cℹ️ All animations already visible', 'font-weight: bold; color: #60a5fa;');
  console.log('   Try: window.resetAnimations() then scroll to test');
}

console.log('%c═══════════════════════════════════════', 'color: #6b7280;');
console.log('');
console.log('%c🎬 TEST COMPLETE', 'font-size: 16px; font-weight: bold; color: #60a5fa;');
