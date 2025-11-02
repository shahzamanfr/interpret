# 🔍 Production Verification Checklist

## Pre-Deployment Verification

Run this checklist before deploying to production to ensure everything works correctly.

---

## ✅ 1. Environment Variables

### Check Local Environment

```bash
# Verify .env file exists
ls -la .env

# Check if variables are set (don't echo values for security)
node -e "console.log('GEMINI:', !!process.env.VITE_GEMINI_API_KEY ? '✅ Set' : '❌ Missing')"
node -e "console.log('PEXELS:', !!process.env.VITE_PEXELS_API_KEY ? '✅ Set (Optional)' : '⚠️ Not set (will use fallback)')"
```

### Production Environment

- [ ] `VITE_GEMINI_API_KEY` set in hosting platform
- [ ] `VITE_PEXELS_API_KEY` set (optional) or confirmed fallback works
- [ ] No `.env` file committed to repository
- [ ] Environment variables are in production scope (not just preview)

---

## ✅ 2. Build Test

```bash
# Clean build
rm -rf dist node_modules/.vite
npm run build

# Check build output
ls -lh dist/
```

**Expected:**
- [ ] Build completes without errors
- [ ] No TypeScript errors
- [ ] Bundle size is reasonable (< 2MB for main chunk)
- [ ] Assets are properly chunked

### Preview Production Build

```bash
npm run preview
```

- [ ] Opens on `http://localhost:4173`
- [ ] Home page loads correctly
- [ ] Images display properly
- [ ] Theme toggle works
- [ ] No console errors

---

## ✅ 3. Functional Testing

### Core Features

#### Image Description
- [ ] Click "Try Image Describe" or "Start Now"
- [ ] Random image loads successfully
- [ ] Image gallery opens when clicking domain cards
- [ ] Can select image from gallery
- [ ] Can type explanation in textarea
- [ ] Submit button works
- [ ] AI feedback appears with scores
- [ ] Score history saves and displays
- [ ] "New Image" button generates different image

#### Theme Switching
- [ ] Click theme toggle in header
- [ ] Theme changes smoothly (dark ↔ light)
- [ ] All text is readable in both themes
- [ ] **CRITICAL**: Image gallery stays visible when switching themes
- [ ] Animations play smoothly
- [ ] No flickering or layout shifts

#### Coach Modes
- [ ] Teacher mode loads correctly
- [ ] Storyteller mode loads correctly
- [ ] Debater mode loads correctly
- [ ] Group Discussion mode loads correctly
- [ ] Can navigate back to home from each mode
- [ ] State resets properly when returning home

#### AI Debate (Critical)
- [ ] Enter debate topic
- [ ] AI responds in human-like natural language (not robotic)
- [ ] Responses are 4-6 sentences (not too short)
- [ ] AI uses everyday words (not formulaic)
- [ ] Can complete full debate (4+ exchanges)
- [ ] Final evaluation appears with scores

#### Image Gallery
- [ ] Domain cards display with preview images
- [ ] Clicking domain opens gallery modal
- [ ] Gallery shows 25+ images from Pexels
- [ ] Images load progressively
- [ ] Can click any image to select it
- [ ] "Back to Home" button works
- [ ] "Refresh" button loads new images
- [ ] Modal closes after selecting image
- [ ] **TEST**: Switch theme while gallery is open - should stay visible

### Error Handling

#### Missing API Key
```bash
# Test with missing key
VITE_GEMINI_API_KEY="" npm run preview
```
- [ ] Shows "API Key Required" message
- [ ] Provides link to get API key
- [ ] Doesn't crash the app

#### Network Errors
- [ ] Disable network in DevTools
- [ ] Try to get feedback
- [ ] Should show retry message or fallback
- [ ] App doesn't crash

#### Invalid Image
- [ ] Try to load broken image URL
- [ ] Error handling prevents crash
- [ ] User sees helpful error message

---

## ✅ 4. Responsive Design

### Mobile (375px - 767px)
- [ ] Home page layouts correctly
- [ ] Text is readable (not too small)
- [ ] Buttons are tap-friendly (44px min)
- [ ] Image gallery works on mobile
- [ ] Modal covers full screen
- [ ] Theme toggle accessible
- [ ] No horizontal scrolling
- [ ] Form inputs work properly
- [ ] Navigation is intuitive

### Tablet (768px - 1023px)
- [ ] Two-column layouts work
- [ ] Domain cards display nicely
- [ ] Image gallery grid adjusts
- [ ] Touch interactions smooth

### Desktop (1024px+)
- [ ] Full layout displays properly
- [ ] Hover effects work
- [ ] All features accessible
- [ ] No layout issues

**Test on actual devices:**
- [ ] iPhone/Android phone
- [ ] iPad/Android tablet
- [ ] Desktop browser (Chrome/Firefox/Safari)

---

## ✅ 5. Performance

### Lighthouse Audit

```bash
# Build first
npm run build
npm run preview

# Then run Lighthouse in Chrome DevTools
```

**Target Scores:**
- [ ] Performance: > 90
- [ ] Accessibility: > 90
- [ ] Best Practices: > 90
- [ ] SEO: > 80

### Load Time
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3.5s
- [ ] Total page size < 3MB

### Runtime Performance
- [ ] No memory leaks (test by using app for 5+ minutes)
- [ ] Smooth animations (60 FPS)
- [ ] Quick AI response times (< 5s typically)

---

## ✅ 6. Browser Compatibility

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Chrome Mobile
- [ ] Safari Mobile

**Features to test:**
- [ ] Theme transitions
- [ ] Image gallery
- [ ] Voice recording (if applicable)
- [ ] File uploads
- [ ] Local storage persistence

---

## ✅ 7. Security Audit

- [ ] No API keys in source code (grep for hardcoded keys)
- [ ] No console.log in production (all wrapped in DEV checks)
- [ ] No sensitive data in localStorage
- [ ] HTTPS enforced (check hosting settings)
- [ ] CSP headers configured (if applicable)
- [ ] No XSS vulnerabilities in user inputs

### Quick Security Check

```bash
# Search for hardcoded keys (should find none)
grep -r "AIzaSy" src/
grep -r "sk-" src/
grep -r "API_KEY.*=" src/ | grep -v "VITE_"

# Check for console.logs (should all be in DEV checks)
grep -r "console.log" src/ | grep -v "import.meta.env.DEV"
```

---

## ✅ 8. API Integration

### Gemini API
- [ ] Test with valid API key
- [ ] Verify quota limits (60/min, 1500/day)
- [ ] Test retry logic (simulate 503 error if possible)
- [ ] Confirm responses are consistent
- [ ] Verify all coach modes work

### Pexels API
- [ ] Test with valid API key (200/hour limit)
- [ ] Test WITHOUT API key (should use fallback)
- [ ] Verify image loading
- [ ] Check attribution displays
- [ ] Confirm refresh button works

---

## ✅ 9. State Management

- [ ] User input persists during session
- [ ] Score history saves to localStorage
- [ ] History displays correctly on reload
- [ ] Theme preference persists
- [ ] State resets properly when navigating
- [ ] No memory leaks from state

---

## ✅ 10. Edge Cases

- [ ] Very long explanations (1000+ words)
- [ ] Empty submissions (should show error)
- [ ] Special characters in input
- [ ] Rapid clicking/submitting
- [ ] Browser back/forward buttons
- [ ] Page refresh during loading
- [ ] Multiple tabs open
- [ ] Offline mode handling

---

## ✅ 11. Critical UI Fixes Verification

### Image Gallery Theme Bug (FIXED)
**Issue:** Gallery disappeared when switching themes

**Test:**
1. [ ] Click any domain card
2. [ ] Gallery opens and displays images
3. [ ] Toggle theme (dark → light OR light → dark)
4. [ ] **VERIFY:** Gallery stays visible (no disappearing)
5. [ ] Can still click images
6. [ ] Gallery closes properly

**Root cause:** Scroll animation CSS was affecting portal-rendered modal
**Fix:** React Portal + CSS exclusions + z-index management

### AI Debate Human-like Responses (FIXED)
**Issue:** AI responses were too robotic and formulaic

**Test:**
1. [ ] Start debate with topic: "Social media is harmful"
2. [ ] Read AI's opening response
3. [ ] **VERIFY:** Uses natural language (no "Furthermore", "Moreover")
4. [ ] **VERIFY:** Response is 4-6 sentences (not too short)
5. [ ] **VERIFY:** Uses contractions (you're, that's, doesn't)
6. [ ] **VERIFY:** Sounds like texting a friend who disagrees
7. [ ] Continue debate for 3-4 exchanges
8. [ ] **VERIFY:** All responses feel human and natural

---

## ✅ 12. Production Deployment

### Pre-Deploy
- [ ] All tests above passed
- [ ] No blocking bugs
- [ ] Environment variables ready
- [ ] Domain configured (if custom)

### Deploy
- [ ] Push to production
- [ ] Wait for build to complete
- [ ] Verify deployment succeeded

### Post-Deploy
- [ ] Visit production URL
- [ ] Smoke test critical features:
  - [ ] Home page loads
  - [ ] Can describe an image
  - [ ] AI responds correctly
  - [ ] Theme toggle works
  - [ ] Image gallery works
- [ ] Check browser console for errors
- [ ] Verify API keys are working
- [ ] Test on mobile device

---

## ✅ 13. Monitoring Setup

- [ ] Error tracking configured (Sentry/LogRocket)
- [ ] Analytics configured (GA/Vercel)
- [ ] Performance monitoring active
- [ ] Uptime monitoring set up
- [ ] API usage tracking enabled

---

## 🎯 Final Production Check

Before announcing to users:

- [ ] All checklist items above completed
- [ ] No critical bugs
- [ ] Performance acceptable
- [ ] Mobile experience smooth
- [ ] API costs within budget
- [ ] Support documentation ready

---

## 📞 Emergency Rollback Plan

If critical issues found in production:

1. **Immediate:** Revert to previous version
2. **Quick fix:** Deploy hotfix from main branch
3. **Communication:** Notify users if needed
4. **Investigation:** Debug issue in staging

### Rollback Commands (Vercel)
```bash
# List deployments
vercel ls

# Promote previous deployment
vercel promote [deployment-url]
```

---

## ✅ Status: Ready for Production

Once all items checked:

**✨ Your app is production-ready! ✨**

- Well-tested features
- Comprehensive error handling
- Optimized performance
- Secure configuration
- Great user experience

**Go ahead and deploy! 🚀**

---

## 📝 Notes

- Keep this checklist for future updates
- Run abbreviated version for minor updates
- Full checklist for major releases
- Update checklist as app evolves

**Last Updated:** [Current Date]
**Version:** 1.0.0
**Deployment Platform:** [Vercel/Netlify/etc]