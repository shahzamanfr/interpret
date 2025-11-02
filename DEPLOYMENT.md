# 🚀 Production Deployment Guide

## Pre-Deployment Checklist

### ✅ 1. Environment Variables

**Required:**
- `VITE_GEMINI_API_KEY` - Get from https://makersuite.google.com/app/apikey

**Optional:**
- `VITE_PEXELS_API_KEY` - Get from https://www.pexels.com/api/ (fallback images used if not provided)

### ✅ 2. Build Configuration

The app is production-ready with:
- ✅ No hardcoded API keys in code
- ✅ Comprehensive error handling
- ✅ API retry logic for transient failures
- ✅ Graceful fallbacks for missing services
- ✅ Optimized bundle size
- ✅ React portal-based modals (no z-index conflicts)

### ✅ 3. Security Measures

- API keys are loaded from environment variables only
- No sensitive data exposed in client-side code
- CORS-safe image handling
- CSP-compatible (no inline scripts)

---

## 🌐 Deployment Platforms

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add VITE_GEMINI_API_KEY
vercel env add VITE_PEXELS_API_KEY
```

**Vercel Dashboard Method:**
1. Connect your GitHub repository
2. Go to Project Settings → Environment Variables
3. Add `VITE_GEMINI_API_KEY` (Production)
4. Add `VITE_PEXELS_API_KEY` (Production, Optional)
5. Redeploy

### Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Build
npm run build

# Deploy
netlify deploy --prod

# Set environment variables
netlify env:set VITE_GEMINI_API_KEY your_key_here
netlify env:set VITE_PEXELS_API_KEY your_key_here
```

**Netlify Dashboard Method:**
1. Site Settings → Build & deploy → Environment
2. Add `VITE_GEMINI_API_KEY`
3. Add `VITE_PEXELS_API_KEY` (Optional)
4. Trigger new deploy

### Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Init project
railway init

# Deploy
railway up

# Set environment variables
railway variables set VITE_GEMINI_API_KEY=your_key_here
railway variables set VITE_PEXELS_API_KEY=your_key_here
```

### GitHub Pages (Static)

⚠️ **Not recommended** - Environment variables are baked into build, exposing keys

---

## 📦 Build Commands

```bash
# Development
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview

# Type check
npm run typecheck
```

---

## 🔧 Production Optimizations

### 1. AI Response Consistency
- All AI prompts are carefully engineered for consistent responses
- Temperature settings optimized for production (0.9 for debate, 0.3 for evaluation)
- Retry logic handles transient API failures automatically
- Fallback responses prevent app crashes

### 2. Image Service Reliability
- Primary: Pexels API (free tier: 200 requests/hour)
- Fallback: Picsum Photos (unlimited, random images)
- Images cached on first load per domain
- Automatic retry on network failures

### 3. Performance
- React.lazy for code splitting (if needed)
- Optimized images with responsive loading
- Minimal bundle size with tree-shaking
- CSS transitions use GPU acceleration

### 4. Error Handling
- Global error boundary catches React errors
- API errors show user-friendly messages
- Network failures trigger automatic retries
- Missing API keys show setup instructions

---

## 🚨 Common Issues & Solutions

### Issue: "API Key Required" Screen

**Solution:**
```bash
# Check environment variables are set
echo $VITE_GEMINI_API_KEY

# Rebuild after adding env vars
npm run build
```

### Issue: Images Not Loading

**Solutions:**
1. Check Pexels API key (or remove for fallback)
2. Verify CORS settings
3. Check browser console for errors

### Issue: AI Responses Slow

**Solutions:**
1. Use Gemini Flash model (already configured)
2. Check API quota: https://makersuite.google.com/app/apikey
3. Implement caching layer (optional)

### Issue: Gallery Disappears on Theme Change

**Solution:** ✅ Already fixed with React Portal + CSS exclusions

---

## 📊 Monitoring Production

### Key Metrics to Track

1. **API Usage**
   - Monitor Gemini API quota usage
   - Track Pexels API requests
   - Set up alerts for quota limits

2. **Error Rates**
   - Check browser console errors
   - Monitor network failures
   - Track AI response failures

3. **Performance**
   - Page load time
   - Time to interactive
   - Image load times

### Recommended Tools

- **Sentry** - Error tracking
- **Google Analytics** - User analytics
- **Vercel Analytics** - Performance monitoring
- **LogRocket** - Session replay

---

## 🔐 Security Best Practices

1. **API Keys**
   - Never commit .env file
   - Rotate keys regularly
   - Use different keys for dev/prod
   - Monitor usage for anomalies

2. **Rate Limiting**
   - Gemini free tier: 60 requests/minute
   - Pexels free tier: 200 requests/hour
   - Implement client-side debouncing if needed

3. **Content Security**
   - Review CSP headers
   - Enable HTTPS only
   - Validate user inputs
   - Sanitize AI responses

---

## 📈 Scaling Considerations

### For High Traffic

1. **Add Backend Proxy**
   - Hide API keys from client
   - Add rate limiting
   - Cache AI responses
   - Queue requests

2. **Optimize Costs**
   - Cache common AI responses
   - Use cheaper models for non-critical features
   - Implement usage quotas per user

3. **Infrastructure**
   - CDN for static assets
   - Database for response caching
   - Redis for session management
   - Load balancer for API proxy

---

## 🎯 Production Checklist

Before going live:

- [ ] All API keys set in production environment
- [ ] Test all features in production build
- [ ] Verify error handling works
- [ ] Check mobile responsiveness
- [ ] Test theme switching
- [ ] Verify image gallery functionality
- [ ] Test all AI coach modes
- [ ] Check debate interface
- [ ] Test group discussion
- [ ] Verify file uploads work
- [ ] Test voice recording (if applicable)
- [ ] Check accessibility
- [ ] Run Lighthouse audit
- [ ] Set up error monitoring
- [ ] Configure analytics
- [ ] Test on multiple browsers
- [ ] Verify SSL certificate
- [ ] Set up custom domain (optional)

---

## 🆘 Support

If you encounter issues:

1. Check the browser console for errors
2. Verify environment variables are set
3. Review this deployment guide
4. Check API quota limits
5. Test with fallback images

---

## 📝 Notes

- The app is designed to handle high concurrent usage
- AI responses are optimized for consistency
- All animations are GPU-accelerated
- Error boundaries prevent full app crashes
- Fallbacks ensure app remains functional even if services fail

**Ready for production deployment! 🚀**