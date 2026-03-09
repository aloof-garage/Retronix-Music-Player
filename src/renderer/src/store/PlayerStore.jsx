import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react'
import { getAudioEngine } from '../engine/AudioEngine'
import { shuffleArray } from '../utils/helpers'

// ── Initial State ─────────────────────────────────────────────────────────────
const initialState = {
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 75,
  shuffleOn: false,
  repeatMode: 0, // 0=off, 1=all, 2=one
  queue: [],
  queueIndex: 0,
  shuffledQueue: [],
  crossfade: 0,
  loading: false,
  error: null,
}

// ── Reducer ───────────────────────────────────────────────────────────────────
function playerReducer(state, action) {
  switch (action.type) {
    case 'SET_TRACK':
      return { ...state, currentTrack: action.track, currentTime: 0, duration: 0, loading: true, error: null }
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.playing }
    case 'SET_TIME':
      return { ...state, currentTime: action.time, duration: action.duration || state.duration }
    case 'SET_DURATION':
      return { ...state, duration: action.duration, loading: false }
    case 'SET_VOLUME':
      return { ...state, volume: action.volume }
    case 'TOGGLE_SHUFFLE':
      return { ...state, shuffleOn: !state.shuffleOn }
    case 'SET_REPEAT':
      return { ...state, repeatMode: action.mode }
    case 'SET_QUEUE':
      return { ...state, queue: action.queue, queueIndex: action.index ?? 0 }
    case 'SET_QUEUE_INDEX':
      return { ...state, queueIndex: action.index }
    case 'SET_LOADING':
      return { ...state, loading: action.loading }
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false }
    default:
      return state
  }
}

// ── Context ───────────────────────────────────────────────────────────────────
const PlayerContext = createContext(null)

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(playerReducer, initialState)
  const engineRef = useRef(null)
  const stateRef = useRef(state)
  stateRef.current = state

  // ── Initialize Audio Engine ─────────────────────────────────────────────
  useEffect(() => {
    engineRef.current = getAudioEngine()
    const engine = engineRef.current

    engine.onEnded = () => {
      const { repeatMode, queue, queueIndex, shuffleOn, shuffledQueue } = stateRef.current
      if (repeatMode === 2) {
        // Repeat one
        engine.seek(0)
        engine.play(0)
      } else {
        // Advance queue
        const nextIndex = queueIndex + 1
        const currentQueue = shuffleOn ? shuffledQueue : queue
        if (nextIndex < currentQueue.length) {
          dispatch({ type: 'SET_QUEUE_INDEX', index: nextIndex })
          playTrackByIndex(nextIndex, currentQueue)
        } else if (repeatMode === 1) {
          // Repeat all
          dispatch({ type: 'SET_QUEUE_INDEX', index: 0 })
          playTrackByIndex(0, currentQueue)
        } else {
          dispatch({ type: 'SET_PLAYING', playing: false })
        }
      }
    }

    engine.onTimeUpdate = (time, dur) => {
      dispatch({ type: 'SET_TIME', time, duration: dur })
    }

    engine.onBufferLoaded = (duration) => {
      dispatch({ type: 'SET_DURATION', duration })
    }

    engine.onError = (err) => {
      dispatch({ type: 'SET_ERROR', error: err })
    }

    // Load settings
    if (window.electronAPI) {
      window.electronAPI.settings.get('volume').then(v => {
        if (v !== undefined) {
          dispatch({ type: 'SET_VOLUME', volume: v })
          engine.setVolume(v)
        }
      })
    }

    return () => engine.destroy()
  }, [])

  // ── Volume sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    engineRef.current?.setVolume(state.volume)
  }, [state.volume])

  // ── Play track function ─────────────────────────────────────────────────
  const playTrackByIndex = useCallback(async (index, queue) => {
    const track = queue[index]
    if (!track) return

    dispatch({ type: 'SET_TRACK', track })

    try {
      const engine = engineRef.current
      let filePath = track.file_path

      if (!filePath && track.id && window.electronAPI) {
        filePath = await window.electronAPI.audio.getFilePath(track.id)
      }

      if (!filePath) throw new Error('No file path for track')

      await engine.loadFile(filePath)
      engine.play(0)
      dispatch({ type: 'SET_PLAYING', playing: true })

      // Record play
      if (track.id && window.electronAPI) {
        window.electronAPI.library.recordPlay(track.id)
      }

      // Update tray
      if (window.electronAPI) {
        window.electronAPI.tray.updateTrack({
          title: track.title,
          artist: track.artist,
          isPlaying: true
        })
        window.electronAPI.notify.trackChanged({
          title: track.title,
          artist: track.artist,
          album: track.album
        })
      }
    } catch (err) {
      console.error('[Player] Error loading track:', err)
      dispatch({ type: 'SET_ERROR', error: err.message })
    }
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────
  const actions = {
    playTrack: useCallback(async (track, queue) => {
      const q = queue || [track]
      const idx = q.findIndex(t => t.id === track.id || t.file_path === track.file_path)
      const shuffled = shuffleArray(q)
      dispatch({ type: 'SET_QUEUE', queue: q, index: idx })
      dispatch({ type: 'SET_QUEUE', queue: q, index: idx })
      stateRef.current.shuffledQueue = shuffled
      await playTrackByIndex(Math.max(0, idx), q)
    }, [playTrackByIndex]),

    togglePlay: useCallback(() => {
      const engine = engineRef.current
      if (!engine || !stateRef.current.currentTrack) return
      if (stateRef.current.isPlaying) {
        engine.pause()
        dispatch({ type: 'SET_PLAYING', playing: false })
        window.electronAPI?.tray.updatePlayState(false)
      } else {
        engine.play(engine.pauseOffset)
        dispatch({ type: 'SET_PLAYING', playing: true })
        window.electronAPI?.tray.updatePlayState(true)
      }
    }, []),

    nextTrack: useCallback(() => {
      const { queue, queueIndex, shuffleOn, shuffledQueue, repeatMode } = stateRef.current
      const currentQueue = shuffleOn ? shuffledQueue : queue
      const nextIdx = queueIndex + 1
      if (nextIdx < currentQueue.length) {
        dispatch({ type: 'SET_QUEUE_INDEX', index: nextIdx })
        playTrackByIndex(nextIdx, currentQueue)
      } else if (repeatMode === 1) {
        dispatch({ type: 'SET_QUEUE_INDEX', index: 0 })
        playTrackByIndex(0, currentQueue)
      }
    }, [playTrackByIndex]),

    prevTrack: useCallback(() => {
      const engine = engineRef.current
      const { queue, queueIndex, shuffleOn, shuffledQueue } = stateRef.current
      const currentQueue = shuffleOn ? shuffledQueue : queue

      // If > 3s in, restart current track
      if (engine && engine.getCurrentTime() > 3) {
        engine.seek(0)
        return
      }

      const prevIdx = queueIndex - 1
      if (prevIdx >= 0) {
        dispatch({ type: 'SET_QUEUE_INDEX', index: prevIdx })
        playTrackByIndex(prevIdx, currentQueue)
      }
    }, [playTrackByIndex]),

    seek: useCallback((time) => {
      engineRef.current?.seek(time)
      dispatch({ type: 'SET_TIME', time, duration: stateRef.current.duration })
    }, []),

    setVolume: useCallback((vol) => {
      dispatch({ type: 'SET_VOLUME', volume: vol })
      window.electronAPI?.settings.set('volume', vol)
    }, []),

    toggleShuffle: useCallback(() => {
      dispatch({ type: 'TOGGLE_SHUFFLE' })
      const newShuffled = shuffleArray(stateRef.current.queue)
      stateRef.current.shuffledQueue = newShuffled
    }, []),

    cycleRepeat: useCallback(() => {
      const next = (stateRef.current.repeatMode + 1) % 3
      dispatch({ type: 'SET_REPEAT', mode: next })
    }, []),

    setQueue: useCallback((tracks, startIndex = 0) => {
      dispatch({ type: 'SET_QUEUE', queue: tracks, index: startIndex })
      stateRef.current.shuffledQueue = shuffleArray(tracks)
    }, []),

    setEqBand: useCallback((freq, gain) => {
      engineRef.current?.setEqBand(freq, gain)
    }, []),

    applyEqPreset: useCallback((preset) => {
      return engineRef.current?.applyEqPreset(preset)
    }, []),

    getAnalyser: useCallback(() => {
      return engineRef.current?.analyserNode
    }, []),

    getEngine: useCallback(() => engineRef.current, []),
  }

  return (
    <PlayerContext.Provider value={{ state, ...actions }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
