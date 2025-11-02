import { supabase } from './client'

export interface Challenge {
  id?: string
  challenge_id: string
  image_url: string
  created_by: string
  created_at: string
  expires_at: string
  is_active: boolean
}

export interface ChallengeParticipant {
  id?: string
  challenge_id: string
  user_id: string
  user_name: string
  score?: number
  explanation?: string
  submitted_at: string
}

// Generate a random challenge ID (6 characters, alphanumeric)
export const generateChallengeId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Create a new challenge
export const createChallenge = async (imageUrl: string, createdBy: string): Promise<Challenge | null> => {
  if (!supabase) {
    console.error('❌ Supabase not initialized. Please check your .env file.')
    return null
  }

  try {
    const challengeId = generateChallengeId()
    const { data, error } = await supabase
      .from('challenges')
      .insert({
        challenge_id: challengeId,
        image_url: imageUrl,
        created_by: createdBy,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
      })
      .select()
      .single()

    if (error) {
      console.error('❌ Error creating challenge:', error)
      if (error.code === 'PGRST205') {
        console.error('💡 The challenges table does not exist. Please run the SQL schema in Supabase dashboard.')
        console.error('   Go to SQL Editor → New Query → Paste supabase-schema.sql → Run')
      }
      return null
    }

    console.log('✅ Challenge created successfully:', challengeId)
    return data
  } catch (error) {
    console.error('❌ Error in createChallenge:', error)
    return null
  }
}

// Get challenge by ID
export const getChallenge = async (challengeId: string): Promise<Challenge | null> => {
  if (!supabase) {
    console.error('Supabase not initialized')
    return null
  }

  try {
    const { data, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('is_active', true)
      .single()

    if (error) {
      console.error('Error fetching challenge:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Error in getChallenge:', error)
    return null
  }
}

// Join a challenge
export const joinChallenge = async (
  challengeId: string, 
  userId: string, 
  userName: string
): Promise<boolean> => {
  if (!supabase) {
    console.error('Supabase not initialized')
    return false
  }

  try {
    const { error } = await supabase
      .from('challenge_participants')
      .insert({
        challenge_id: challengeId,
        user_id: userId,
        user_name: userName
      })

    if (error) {
      console.error('Error joining challenge:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in joinChallenge:', error)
    return false
  }
}

// Submit score for a challenge
export const submitChallengeScore = async (
  challengeId: string,
  userId: string,
  score: number,
  explanation: string
): Promise<boolean> => {
  if (!supabase) {
    console.error('Supabase not initialized')
    return false
  }

  try {
    const { error } = await supabase
      .from('challenge_participants')
      .update({
        score,
        explanation,
        submitted_at: new Date().toISOString()
      })
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)

    if (error) {
      console.error('Error submitting score:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in submitChallengeScore:', error)
    return false
  }
}

// Get challenge participants
export const getChallengeParticipants = async (challengeId: string): Promise<ChallengeParticipant[]> => {
  if (!supabase) {
    console.error('Supabase not initialized')
    return []
  }

  try {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select('*')
      .eq('challenge_id', challengeId)
      .order('score', { ascending: false })

    if (error) {
      console.error('Error fetching participants:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error in getChallengeParticipants:', error)
    return []
  }
}
