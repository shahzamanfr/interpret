# Image Describe Challenge Mode

## Overview
The Image Describe Challenge Mode allows users to compete with friends in real-time by describing the same image and comparing scores.

## Features

### 🎯 **Challenge Creation**
- Click "Play with Friends" button in the image describe section
- Creates a unique 6-character challenge code (e.g., "ABC123")
- Generates a shareable URL for friends to join

### 🏆 **Real-time Competition**
- Live leaderboard showing all participants and their scores
- Real-time updates when participants submit their descriptions
- Score comparison and ranking system

### 🔗 **Easy Sharing**
- Copy challenge link to clipboard
- Share challenge code with friends
- Friends can join using the challenge code or direct URL

## How It Works

1. **Create Challenge**: User clicks "Play with Friends" → Creates challenge with unique code
2. **Share**: User shares the challenge code or URL with friends
3. **Join**: Friends enter the challenge code or click the shared URL
4. **Compete**: Everyone describes the same image and gets scored
5. **Compare**: Real-time leaderboard shows everyone's scores

## Technical Implementation

### Database Schema
- `challenges` table: Stores challenge info (ID, image URL, creator, expiry)
- `challenge_participants` table: Tracks participants and their scores

### Real-time Features
- Supabase real-time subscriptions for live updates
- Automatic participant list updates
- Live leaderboard updates when scores are submitted

### Components
- `ChallengeModeToggle`: Create/join challenge interface
- `ChallengePanel`: Live challenge status and leaderboard
- `useChallenge`: Hook for challenge management and real-time updates

## Environment Setup

Add these environment variables to your `.env` file:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Database Setup

Run the SQL commands in `supabase-schema.sql` to set up the required tables and policies.

## Usage

1. Go to the image describe section
2. Click "Play with Friends"
3. Choose to create a new challenge or join an existing one
4. Share the challenge code with friends
5. Compete and see real-time results!
