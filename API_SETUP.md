# API Setup Guide for AI Communication Coach

## Required API Keys

### 1. Gemini AI API Key (REQUIRED)
The app needs a Gemini AI API key to provide AI-powered feedback on image descriptions.

**How to get it:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key

**How to set it up:**
1. Open the `.env` file in your project root
2. Replace `your_gemini_api_key_here` with your actual API key:
   ```
   VITE_GEMINI_API_KEY=your_actual_api_key_here
   ```

### 2. Optional API Keys

#### Pexels API Key (Optional)
For additional high-quality image sources.

**How to get it:**
1. Go to [Pexels API](https://www.pexels.com/api/)
2. Sign up for a free account
3. Get your API key from the dashboard

**How to set it up:**
Add to your `.env` file:
```
VITE_PEXELS_API_KEY=your_pexels_api_key_here
```

#### Supabase Configuration (Optional)
For the challenges feature.

**How to get it:**
1. Go to [Supabase](https://supabase.com)
2. Create a new project
3. Get your project URL and anon key from Settings > API

**How to set it up:**
Add to your `.env` file:
```
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

## Environment File Format

Your `.env` file should look like this:

```env
# Required
VITE_GEMINI_API_KEY=your_actual_gemini_api_key_here

# Optional
VITE_PEXELS_API_KEY=your_pexels_api_key_here
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

## Important Notes

1. **VITE_ Prefix**: All environment variables must start with `VITE_` to be accessible in the client-side code
2. **No Quotes**: Don't wrap the API keys in quotes
3. **Restart Required**: After updating the `.env` file, restart the development server
4. **Security**: Never commit your `.env` file to version control

## Testing the Setup

1. Start the development server: `npm run dev` or `npx vite`
2. Open the app in your browser
3. Try describing an image and submitting it
4. Check the browser console for any API-related errors

## Troubleshooting

### "API Key Missing" Error
- Make sure your `.env` file has `VITE_GEMINI_API_KEY=your_key`
- Restart the development server after updating `.env`
- Check that there are no extra spaces or quotes around the key

### "API Key Invalid" Error
- Verify your API key is correct
- Make sure you're using the Gemini API key, not a different Google API key
- Check if your API key has the necessary permissions

### Images Not Loading
- The app works with random images even without API keys
- For domain-specific images, you may need the Pexels API key
- Check your internet connection

## Getting Help

If you're still having issues:
1. Check the browser console for error messages
2. Verify your API key is active and has credits
3. Make sure you're using the correct environment variable names
4. Restart your development server after making changes
