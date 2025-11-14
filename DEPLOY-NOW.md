# 🚀 Deploy Your Website FREE in 5 Minutes

## Step 1: Create GitHub Account (if you don't have one)
Go to https://github.com/signup

## Step 2: Push Your Code to GitHub

Open terminal in your project folder and run:

```bash
git init
git add .
git commit -m "Ready for production"
git branch -M main
```

Then create a new repository on GitHub:
1. Go to https://github.com/new
2. Name it: `ai-communication-coach` (or any name you want)
3. Click "Create repository"
4. Copy the commands shown and run them:

```bash
git remote add origin https://github.com/YOUR_USERNAME/ai-communication-coach.git
git push -u origin main
```

## Step 3: Deploy to Vercel (100% FREE)

### Option A: One-Click Deploy (Easiest)
1. Go to https://vercel.com/signup
2. Sign up with your GitHub account
3. Click "Add New Project"
4. Select your `ai-communication-coach` repository
5. Vercel will auto-detect it's a Vite project
6. Add environment variables:
   - Click "Environment Variables"
   - Add: `VITE_GEMINI_API_KEY` = `AIzaSyBPEjh_dA8zE28fkzAm-bk7ozKADItV-yw`
   - Add: `VITE_PEXELS_API_KEY` = `Ms4Vpz8j7cHnwMcyXsIgQzeCpY047YCNU5aJY3HlVPJOO4hNRwXexpgq`
7. Click "Deploy"
8. Wait 2-3 minutes
9. **DONE!** Your site is live!

### Option B: Using Vercel CLI
```bash
npm install -g vercel
vercel login
vercel
```

Follow the prompts and your site will be deployed!

## Step 4: Get Your FREE Custom Domain

Vercel gives you a FREE domain like:
- `ai-communication-coach.vercel.app`
- `your-name-coach.vercel.app`

### Want a Custom Name?
In Vercel dashboard:
1. Go to your project
2. Click "Settings" → "Domains"
3. Add your custom domain (e.g., `mycoach.vercel.app`)

### Want Your Own Domain? (Optional - $10/year)
Buy a domain from:
- Namecheap.com ($8-12/year)
- GoDaddy.com ($10-15/year)
- Google Domains ($12/year)

Then connect it in Vercel Settings → Domains

## 🎉 Your Website is Now LIVE!

**Free Features You Get:**
- ✅ Unlimited bandwidth
- ✅ Automatic HTTPS (secure)
- ✅ Global CDN (fast worldwide)
- ✅ Automatic deployments (push to GitHub = auto-deploy)
- ✅ Free SSL certificate
- ✅ 100GB bandwidth/month
- ✅ Custom domain support

## Alternative FREE Options

### Netlify (Also 100% Free)
```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod
```

### GitHub Pages (Free)
1. Go to your repo settings
2. Enable GitHub Pages
3. Select `gh-pages` branch
4. Your site: `https://YOUR_USERNAME.github.io/ai-communication-coach`

## Environment Variables (IMPORTANT!)

Make sure to set these in your hosting platform:

**Vercel/Netlify Dashboard:**
- `VITE_GEMINI_API_KEY` = `AIzaSyBPEjh_dA8zE28fkzAm-bk7ozKADItV-yw`
- `VITE_PEXELS_API_KEY` = `Ms4Vpz8j7cHnwMcyXsIgQzeCpY047YCNU5aJY3HlVPJOO4hNRwXexpgq`

## Troubleshooting

### Site not loading?
- Check environment variables are set
- Check build logs in Vercel dashboard
- Make sure `npm run build` works locally

### API not working?
- Verify environment variables are correct
- Check browser console for errors
- Make sure API keys are valid

## 🎊 Congratulations!

Your AI Communication Coach is now live and accessible worldwide!

Share your link:
- `https://your-project.vercel.app`
- Or your custom domain

**Total Cost: $0 (FREE!)** 🎉
