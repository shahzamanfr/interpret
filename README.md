# 🎯 Open Voice

A powerful AI-powered platform to help you improve your communication skills through interactive practice with multiple coaching modes.

## ✨ Features

- **Image Description Practice** - Describe images and get instant AI feedback
- **Multiple Coach Modes**:
  - 👨‍🏫 **Teacher** - Educational feedback focused on clarity and structure
  - 🎭 **Storyteller** - Creative feedback for narrative skills
  - ⚖️ **Debater** - Real human-like debate opponent
  - 👥 **Group Discussion** - Practice with multiple AI participants
- **Voice Recording** - Speak your explanations naturally
- **File Upload** - Upload documents to practice teaching complex topics
- **Smart Image Gallery** - Choose from curated image collections
- **Progress Tracking** - Monitor your improvement over time
- **Theme Support** - Beautiful dark/light themes with smooth transitions

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Google Gemini API key ([Get one free](https://makersuite.google.com/app/apikey))
- Pexels API key (optional - [Get one free](https://www.pexels.com/api/))

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd open-voice

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### Configuration

Edit `.env` and add your API keys:

```env
# REQUIRED: Google Gemini API Key
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# OPTIONAL: Pexels API Key (fallback images used if not provided)
VITE_PEXELS_API_KEY=your_pexels_api_key_here
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 📦 Production Deployment

### Build for Production

```bash
npm run build
npm run preview  # Test production build locally
```

### Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel Dashboard:
# Settings → Environment Variables
# Add: VITE_GEMINI_API_KEY
# Add: VITE_PEXELS_API_KEY (optional)
```

### Deploy to Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Build and deploy
npm run build
netlify deploy --prod

# Set environment variables
netlify env:set VITE_GEMINI_API_KEY your_key_here
netlify env:set VITE_PEXELS_API_KEY your_key_here
```

### Environment Variables for Production

Set these in your hosting platform:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GEMINI_API_KEY` | ✅ Yes | Google Gemini API key for AI responses |
| `VITE_PEXELS_API_KEY` | ⚠️ Optional | Pexels API for image gallery (uses fallback if missing) |

## 🎮 How to Use

### 1. Image Description Mode

1. Click "Try Image Describe" or "Start Now"
2. Choose an image category or upload your own
3. Select a coaching mode (Teacher/Storyteller)
4. Describe the image in your own words
5. Get instant AI feedback with scores and tips

### 2. Debate Mode

1. Click "Debater" coaching mode
2. Enter a debate topic
3. The AI will take the opposite position
4. Argue your case naturally (4-6 exchanges)
5. Get comprehensive debate analysis

### 3. Group Discussion Mode

1. Select "Group Discussion" mode
2. Enter a discussion topic
3. Multiple AI participants join the conversation
4. Contribute your thoughts naturally
5. Receive evaluation on collaboration skills

### 4. Teaching Mode

1. Upload a document or enter a topic
2. Practice teaching the concept
3. Get feedback on clarity and pedagogy

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **AI**: Google Gemini API (Flash models)
- **Images**: Pexels API + Picsum fallback
- **State**: React Hooks + Context
- **Animation**: CSS transitions + Intersection Observer

## 🔧 Troubleshooting

### API Key Issues

**Problem**: "API Key Required" screen

**Solution**:
```bash
# Verify environment variables are set
echo $VITE_GEMINI_API_KEY

# Restart dev server after adding .env
npm run dev
```

### Images Not Loading

**Solutions**:
1. Check Pexels API key (or it will use fallback)
2. Verify internet connection
3. Check browser console for CORS errors

### Gallery Disappears on Theme Change

**Status**: ✅ Fixed with React Portal rendering

### Slow AI Responses

**Solutions**:
1. Check API quota: https://makersuite.google.com/app/apikey
2. Retry logic is built-in (automatic)
3. Use faster internet connection

### Build Errors

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Type check
npm run build
```

## 📊 API Quotas

### Gemini API (Free Tier)
- 60 requests per minute
- 1,500 requests per day
- Automatic retry on failures

### Pexels API (Free Tier)
- 200 requests per hour
- Automatic fallback to Picsum

## 🔐 Security

- ✅ No hardcoded API keys in code
- ✅ Environment variables only
- ✅ CORS-safe image handling
- ✅ Client-side validation
- ✅ Error boundaries prevent crashes

**⚠️ Important**: Never commit your `.env` file to version control!

## 🎨 Features Deep Dive

### AI Debate System

- Natural human-like responses (not robotic)
- 4-6 sentence responses for engagement
- Everyday language and contractions
- Real-time argumentation
- Comprehensive scoring (6 categories)

### Responsive Design

- Mobile-first approach
- Tablet optimizations
- Desktop enhancements
- Touch-friendly interfaces
- Accessible (ARIA labels)

### Performance

- Code splitting ready
- Optimized images
- GPU-accelerated animations
- Minimal bundle size
- Fast page loads

## 📈 Monitoring Production

Recommended monitoring tools:

- **Sentry** - Error tracking
- **Google Analytics** - User analytics
- **Vercel Analytics** - Performance
- **LogRocket** - Session replay

## 🤝 Contributing

This is a production-ready application. If you'd like to contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

[Your License Here]

## 🆘 Support

For issues:

1. Check browser console for errors
2. Review [DEPLOYMENT.md](./DEPLOYMENT.md)
3. Verify API keys are set correctly
4. Check API quota limits
5. Open an issue with details

## 🎯 Production Checklist

Before deploying:

- [ ] Set `VITE_GEMINI_API_KEY` environment variable
- [ ] Set `VITE_PEXELS_API_KEY` (optional)
- [ ] Test build locally (`npm run preview`)
- [ ] Check all features work
- [ ] Test on mobile devices
- [ ] Verify theme switching
- [ ] Test error handling
- [ ] Run Lighthouse audit
- [ ] Set up monitoring
- [ ] Configure custom domain

## 🚀 Ready for Production

This app is production-ready with:

✅ Comprehensive error handling
✅ API retry logic
✅ Graceful fallbacks
✅ Mobile responsive
✅ Performance optimized
✅ Security hardened
✅ Well documented

**Deploy with confidence!**

---

Made with ❤️ using React + Gemini AI