import { useState, useEffect, useCallback, useRef } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase/client'
import { 
  createChallenge, 
  getChallenge, 
  joinChallenge, 
  submitChallengeScore, 
  getChallengeParticipants,
  Challenge,
  ChallengeParticipant 
} from '../lib/supabase/challenges'

export const useChallenge = (challengeId: string | null, userId: string, userName: string) => {
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [participants, setParticipants] = useState<ChallengeParticipant[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Load challenge data
  useEffect(() => {
    if (!challengeId || !supabase) return

    const loadChallenge = async () => {
      setIsLoading(true)
      try {
        const challengeData = await getChallenge(challengeId)
        if (challengeData) {
          setChallenge(challengeData)
          
          // Join the challenge if not already joined
          await joinChallenge(challengeId, userId, userName)
          
          // Load participants
          const participantsData = await getChallengeParticipants(challengeId)
          setParticipants(participantsData)
        } else {
          setError('Challenge not found or expired')
        }
      } catch (err) {
        console.error('Error loading challenge:', err)
        setError('Failed to load challenge')
      } finally {
        setIsLoading(false)
      }
    }

    loadChallenge()
  }, [challengeId, userId, userName])

  // Setup realtime channel for live updates
  useEffect(() => {
    if (!challengeId || !supabase) return

    const channelName = `challenge:${challengeId}`
    const channel = supabase.channel(channelName)

    // Listen for new participants
    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'challenge_participants',
        filter: `challenge_id=eq.${challengeId}`
      }, async () => {
        // Reload participants when someone joins
        const participantsData = await getChallengeParticipants(challengeId)
        setParticipants(participantsData)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'challenge_participants',
        filter: `challenge_id=eq.${challengeId}`
      }, async () => {
        // Reload participants when someone submits a score
        const participantsData = await getChallengeParticipants(challengeId)
        setParticipants(participantsData)
      })

    // Track connection status
    channel.on('system', {}, (status) => {
      setIsConnected(status === 'SUBSCRIBED')
    })

    // Subscribe to the channel
    channel.subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [challengeId])

  // Create a new challenge
  const createNewChallenge = useCallback(async (imageUrl: string): Promise<Challenge | null> => {
    if (!supabase) {
      setError('Real-time features not available')
      return null
    }

    try {
      const newChallenge = await createChallenge(imageUrl, userId)
      if (newChallenge) {
        setChallenge(newChallenge)
        setError(null)
      }
      return newChallenge
    } catch (err) {
      console.error('Error creating challenge:', err)
      setError('Failed to create challenge')
      return null
    }
  }, [userId])

  // Submit score
  const submitScore = useCallback(async (score: number, explanation: string): Promise<boolean> => {
    if (!challengeId || !supabase) {
      setError('Challenge not available')
      return false
    }

    try {
      const success = await submitChallengeScore(challengeId, userId, score, explanation)
      if (success) {
        // Reload participants to show updated scores
        const participantsData = await getChallengeParticipants(challengeId)
        setParticipants(participantsData)
      }
      return success
    } catch (err) {
      console.error('Error submitting score:', err)
      setError('Failed to submit score')
      return false
    }
  }, [challengeId, userId])

  // Get user's current score
  const getUserScore = useCallback(() => {
    return participants.find(p => p.user_id === userId)?.score
  }, [participants, userId])

  // Get leaderboard (sorted by score)
  const getLeaderboard = useCallback(() => {
    return participants
      .filter(p => p.score !== null && p.score !== undefined)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
  }, [participants])

  // Check if user has submitted
  const hasUserSubmitted = useCallback(() => {
    return participants.some(p => p.user_id === userId && p.score !== null)
  }, [participants, userId])

  return {
    challenge,
    participants,
    isConnected,
    isLoading,
    error,
    createNewChallenge,
    submitScore,
    getUserScore,
    getLeaderboard,
    hasUserSubmitted
  }
}
