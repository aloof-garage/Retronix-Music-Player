import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react'
import { getAudioEngine } from '../engine/AudioEngine'
import { shuffleArray } from '../utils/helpers'

// ── State ─────────────────────────────────────────────────────────────────────
const initialState = {
  currentTrack: null,
  isPlaying:    false,
  currentTime:  0,
  duration:     0,
  volume:       75,
  shuffleOn:    false,
  repeatMode:   0,        // 0=off 1=all 2=one
  queue:        [],
  queueIndex:   0,
  loading:      false,
  error:        null,
  shuffledQueue: [],
}

function playerReducer(state, action) {
  switch (action.type) {
    case 'SET_TRACK':
      return { ...state, currentTrack: action.track, currentTime: 0, duration: 0, loading: true, error: null }
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.playing }
    case 'SET_TIME':
      return { ...state, currentTime: action.time, duration: action.duration ?? state.duration }
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
      return { ...state, error: action.error, loading: false, isPlaying: false }
    case 'SET_SHUFFLED_QUEUE':
      return { ...state, shuffledQueue: action.queue }
    default:
      return state
  }
}

// ── Context ───────────────────────────────────────────────────────────────────
const PlayerContext = createContext(null)

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(playerReducer, initialState)

  // Refs for values that need to be read inside callbacks without stale closure
  const engineRef       = useRef(null)
  const stateRef        = useRef(state)
  const shuffledQueueRef = useRef([])   // separate ref — never mutates React state
  stateRef.current = state

  // ── Init engine ────────────────────────────────────────────────────────────
  useEffect(() => {
    const engine = getAudioEngine()
    engineRef.current = engine

    engine.onEnded = () => {
      const { repeatMode, queue, queueIndex, shuffleOn } = stateRef.current
      const currentQueue = shuffleOn ? shuffledQueueRef.current : queue

      if (repeatMode === 2) {
        // Repeat one: restart from 0
        engine.play(0)
        dispatch({ type: 'SET_TIME', time: 0, duration: engine.duration })
        return
      }

      const nextIdx = queueIndex + 1
      if (nextIdx < currentQueue.length) {
        dispatch({ type: 'SET_QUEUE_INDEX', index: nextIdx })
        _playAt(nextIdx, currentQueue)
      } else if (repeatMode === 1) {
        // Repeat all: wrap around
        dispatch({ type: 'SET_QUEUE_INDEX', index: 0 })
        _playAt(0, currentQueue)
      } else {
        dispatch({ type: 'SET_PLAYING', playing: false })
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

    // Restore saved volume
    if (window.electronAPI) {
      window.electronAPI.settings.get('volume').then(v => {
        if (v != null) {
          dispatch({ type: 'SET_VOLUME', volume: v })
          engine.setVolume(v)
        }
      })
    }

    return () => {
      engine.onEnded = null
      engine.onTimeUpdate = null
      engine.onBufferLoaded = null
      engine.onError = null
    }
  }, [])

  // Sync volume to engine whenever state changes
  useEffect(() => {
    engineRef.current?.setVolume(state.volume)
  }, [state.volume])

  // ── Internal: play a track from a queue by index ───────────────────────────
  // Uses a plain function (not useCallback) so it always reads the latest engine.
  async function _playAt(index, queue) {
    const track = queue[index]
    if (!track) return

    dispatch({ type: 'SET_TRACK', track })

    const engine = engineRef.current
    try {
      let filePath = track.file_path
      if (!filePath && track.id && window.electronAPI) {
        filePath = await window.electronAPI.audio.getFilePath(track.id)
      }
      if (!filePath) throw new Error('No file path for track: ' + JSON.stringify(track.title))

      await engine.loadFile(filePath)
      engine.play(0)
      dispatch({ type: 'SET_PLAYING', playing: true })

      if (track.id && window.electronAPI) {
        window.electronAPI.library.recordPlay(track.id).catch(() => {})
      }
      window.electronAPI?.tray.updateTrack({ title: track.title, artist: track.artist, isPlaying: true })
      window.electronAPI?.notify.trackChanged({ title: track.title, artist: track.artist, album: track.album })

    } catch (err) {
      console.error('[Player] Error playing track:', err)
      dispatch({ type: 'SET_ERROR', error: err.message })
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  const playTrack = useCallback(async (track, queue) => {
    const q   = queue || [track]
    const idx = Math.max(0, q.findIndex(t =>
      (t.id && t.id === track.id) || t.file_path === track.file_path
    ))
    // Build shuffled queue whenever we start a new queue
    shuffledQueueRef.current = shuffleArray([...q])
    // Single dispatch — no duplicate
    dispatch({ type: 'SET_QUEUE', queue: q, index: idx })
    dispatch({ type: 'SET_SHUFFLED_QUEUE', queue: shuffledQueueRef.current })
    await _playAt(idx, q)
  }, [])

  const togglePlay = useCallback(() => {
    const engine = engineRef.current
    const { currentTrack, isPlaying } = stateRef.current
    if (!engine || !currentTrack) return

    if (isPlaying) {
      engine.pause()
      dispatch({ type: 'SET_PLAYING', playing: false })
      window.electronAPI?.tray.updatePlayState(false)
    } else {
      // Resume from pauseOffset
      engine.play(engine.pauseOffset)
      dispatch({ type: 'SET_PLAYING', playing: true })
      window.electronAPI?.tray.updatePlayState(true)
    }
  }, [])

  const nextTrack = useCallback(() => {
    const { queue, queueIndex, shuffleOn, repeatMode } = stateRef.current
    const currentQueue = shuffleOn ? shuffledQueueRef.current : queue
    const nextIdx = queueIndex + 1

    if (nextIdx < currentQueue.length) {
      dispatch({ type: 'SET_QUEUE_INDEX', index: nextIdx })
      _playAt(nextIdx, currentQueue)
    } else if (repeatMode === 1) {
      dispatch({ type: 'SET_QUEUE_INDEX', index: 0 })
      _playAt(0, currentQueue)
    }
  }, [])

  const prevTrack = useCallback(() => {
    const engine = engineRef.current
    const { queue, queueIndex, shuffleOn } = stateRef.current
    const currentQueue = shuffleOn ? shuffledQueueRef.current : queue

    // If more than 3 seconds played, restart the current track
    if (engine && engine.getCurrentTime() > 3) {
      engine.seek(0)
      dispatch({ type: 'SET_TIME', time: 0, duration: engine.duration })
      return
    }

    const prevIdx = queueIndex - 1
    if (prevIdx >= 0) {
      dispatch({ type: 'SET_QUEUE_INDEX', index: prevIdx })
      _playAt(prevIdx, currentQueue)
    }
  }, [])

  const seek = useCallback((time) => {
    engineRef.current?.seek(time)
    dispatch({ type: 'SET_TIME', time, duration: stateRef.current.duration })
  }, [])

  const setVolume = useCallback((vol) => {
    dispatch({ type: 'SET_VOLUME', volume: vol })
    window.electronAPI?.settings.set('volume', vol)
  }, [])

  const toggleShuffle = useCallback(() => {
    dispatch({ type: 'TOGGLE_SHUFFLE' })
    shuffledQueueRef.current = shuffleArray([...stateRef.current.queue])
    dispatch({ type: 'SET_SHUFFLED_QUEUE', queue: shuffledQueueRef.current })
  }, [])

  const cycleRepeat = useCallback(() => {
    dispatch({ type: 'SET_REPEAT', mode: (stateRef.current.repeatMode + 1) % 3 })
  }, [])

  const setQueue = useCallback((tracks, startIndex = 0) => {
    shuffledQueueRef.current = shuffleArray([...tracks])
    dispatch({ type: 'SET_QUEUE', queue: tracks, index: startIndex })
    dispatch({ type: 'SET_SHUFFLED_QUEUE', queue: shuffledQueueRef.current })
  }, [])

  const setEqBand = useCallback((freq, gain) => {
    engineRef.current?.setEqBand(freq, gain)
  }, [])

  const applyEqPreset = useCallback((preset) => {
    return engineRef.current?.applyEqPreset(preset)
  }, [])

  const getAnalyser = useCallback(() => {
    return engineRef.current?.analyserNode || null
  }, [])

  const getEngine = useCallback(() => engineRef.current, [])

  return (
    <PlayerContext.Provider value={{
      state,
      playTrack, togglePlay, nextTrack, prevTrack,
      seek, setVolume, toggleShuffle, cycleRepeat,
      setQueue, setEqBand, applyEqPreset,
      getAnalyser, getEngine,
    }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
