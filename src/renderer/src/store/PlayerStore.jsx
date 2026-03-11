import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react'
import { getAudioEngine } from '../engine/AudioEngine'
import { shuffleArray } from '../utils/helpers'

const initialState = {
  currentTrack:  null,
  isPlaying:     false,
  currentTime:   0,
  duration:      0,
  volume:        75,
  shuffleOn:     false,
  repeatMode:    0,       // 0=off 1=all 2=one
  queue:         [],
  queueIndex:    0,
  loading:       false,
  error:         null,
  shuffledQueue: [],
  crossfadeTime: 0,
}

function playerReducer(state, action) {
  switch (action.type) {
    case 'SET_TRACK':         return { ...state, currentTrack: action.track, currentTime: 0, duration: 0, loading: true, error: null }
    case 'SET_PLAYING':       return { ...state, isPlaying: action.playing }
    case 'SET_TIME':          return { ...state, currentTime: action.time, duration: action.duration ?? state.duration }
    case 'SET_DURATION':      return { ...state, duration: action.duration, loading: false }
    case 'SET_VOLUME':        return { ...state, volume: action.volume }
    case 'TOGGLE_SHUFFLE':    return { ...state, shuffleOn: !state.shuffleOn }
    case 'SET_REPEAT':        return { ...state, repeatMode: action.mode }
    case 'SET_QUEUE':         return { ...state, queue: action.queue, queueIndex: action.index ?? 0 }
    case 'SET_QUEUE_INDEX':   return { ...state, queueIndex: action.index }
    case 'SET_LOADING':       return { ...state, loading: action.loading }
    case 'SET_ERROR':         return { ...state, error: action.error, loading: false, isPlaying: false }
    case 'SET_SHUFFLED_QUEUE':return { ...state, shuffledQueue: action.queue }
    case 'SET_CROSSFADE':     return { ...state, crossfadeTime: action.seconds }
    case 'TRACK_CHANGED_XFADE': // crossfade completed – update track + index without reloading audio
      return { ...state, currentTrack: action.track, queueIndex: action.index, currentTime: 0, duration: action.duration || 0, loading: false }
    default: return state
  }
}

const PlayerContext = createContext(null)

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(playerReducer, initialState)
  const engineRef        = useRef(null)
  const stateRef         = useRef(state)
  const shuffledQueueRef = useRef([])
  const seekingRef       = useRef(false)   // suppress time updates while user is dragging seek bar
  stateRef.current = state

  // ── Engine init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const engine = getAudioEngine()
    engineRef.current = engine

    // ── onEnded: advance queue normally (no crossfade case) ─────────────────
    engine.onEnded = () => {
      const { repeatMode, queue, queueIndex, shuffleOn } = stateRef.current
      const currentQueue = shuffleOn ? shuffledQueueRef.current : queue

      if (repeatMode === 2) { engine.play(0); return }

      const nextIdx = queueIndex + 1
      if (nextIdx < currentQueue.length) {
        dispatch({ type: 'SET_QUEUE_INDEX', index: nextIdx })
        _playAt(nextIdx, currentQueue)
      } else if (repeatMode === 1) {
        dispatch({ type: 'SET_QUEUE_INDEX', index: 0 })
        _playAt(0, currentQueue)
      } else {
        dispatch({ type: 'SET_PLAYING', playing: false })
      }
    }

    // ── Time / duration ──────────────────────────────────────────────────────
    engine.onTimeUpdate = (time, dur) => {
      if (!seekingRef.current) {
        dispatch({ type: 'SET_TIME', time, duration: dur })
      }
    }

    engine.onBufferLoaded = (duration) => {
      dispatch({ type: 'SET_DURATION', duration })
    }

    engine.onError = (err) => {
      dispatch({ type: 'SET_ERROR', error: err })
    }

    // ── Crossfade: near-end → preload next track ─────────────────────────────
    engine.onNearEnd = async () => {
      const { queue, queueIndex, shuffleOn, repeatMode } = stateRef.current
      const currentQueue = shuffleOn ? shuffledQueueRef.current : queue
      const nextIdx = queueIndex + 1

      let targetIdx = null
      if (nextIdx < currentQueue.length) targetIdx = nextIdx
      else if (repeatMode === 1) targetIdx = 0

      if (targetIdx === null) return
      const nextTrack = currentQueue[targetIdx]
      if (nextTrack?.file_path) {
        engine.preloadFile(nextTrack.file_path).catch(() => {})
      }
    }

    // ── Crossfade: start the fade ────────────────────────────────────────────
    engine.onCrossfadeStart = () => {
      const { queue, queueIndex, shuffleOn, repeatMode } = stateRef.current
      const currentQueue = shuffleOn ? shuffledQueueRef.current : queue
      const nextIdx = queueIndex + 1

      let targetIdx = null
      if (nextIdx < currentQueue.length) targetIdx = nextIdx
      else if (repeatMode === 1) targetIdx = 0

      if (targetIdx === null || !engine._preloadedBuffer) return

      const nextTrack = currentQueue[targetIdx]
      if (!nextTrack) return

      const started = engine.startCrossfade(engine._preloadedBuffer, engine.crossfadeTime)
      if (started) {
        dispatch({ type: 'TRACK_CHANGED_XFADE', track: nextTrack, index: targetIdx, duration: engine._preloadedBuffer.duration })
        window.electronAPI?.tray.updateTrack({ title: nextTrack.title, artist: nextTrack.artist, isPlaying: true })
        window.electronAPI?.notify.trackChanged({ title: nextTrack.title, artist: nextTrack.artist, album: nextTrack.album })
        if (nextTrack.id && window.electronAPI) {
          window.electronAPI.library.recordPlay(nextTrack.id).catch(() => {})
        }
      }
    }

    // ── Restore saved settings ───────────────────────────────────────────────
    if (window.electronAPI) {
      window.electronAPI.settings.getAll().then(s => {
        if (!s) return
        if (s.volume != null) {
          dispatch({ type: 'SET_VOLUME', volume: s.volume })
          engine.setVolume(s.volume)
        }
        const cf = s.playback?.crossfade ?? 0
        dispatch({ type: 'SET_CROSSFADE', seconds: cf })
        engine.setCrossfadeTime(cf)
      })
    }

    return () => {
      engine.onEnded = null
      engine.onTimeUpdate = null
      engine.onBufferLoaded = null
      engine.onError = null
      engine.onNearEnd = null
      engine.onCrossfadeStart = null
    }
  }, [])

  // Sync volume to engine
  useEffect(() => { engineRef.current?.setVolume(state.volume) }, [state.volume])

  // ── Internal: play a track at index from a queue ──────────────────────────────
  async function _playAt(index, queue) {
    const track = queue[index]
    if (!track) return

    dispatch({ type: 'SET_TRACK', track })
    const engine = engineRef.current
    try {
      const filePath = track.file_path
        || (track.id && window.electronAPI ? await window.electronAPI.audio.getFilePath(track.id) : null)
      if (!filePath) throw new Error('No file path for: ' + track.title)

      await engine.loadFile(filePath)
      engine.play(0)
      dispatch({ type: 'SET_PLAYING', playing: true })

      if (track.id && window.electronAPI) window.electronAPI.library.recordPlay(track.id).catch(() => {})
      window.electronAPI?.tray.updateTrack({ title: track.title, artist: track.artist, isPlaying: true })
      window.electronAPI?.notify.trackChanged({ title: track.title, artist: track.artist, album: track.album })
    } catch (err) {
      console.error('[Player] Error playing track:', err)
      dispatch({ type: 'SET_ERROR', error: err.message })
    }
  }

  // ── Public actions ────────────────────────────────────────────────────────────
  const playTrack = useCallback(async (track, queue) => {
    if (!track) return
    const q   = queue && queue.length > 0 ? queue : [track]
    const idx = Math.max(0, q.findIndex(t => (t.id && t.id === track.id) || t.file_path === track.file_path))
    shuffledQueueRef.current = shuffleArray([...q])
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
    // >3 seconds played → restart current track
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

  // Seeking flag for PlaybackConsole – suppresses timer interference during drag
  const setSeeking = useCallback((val) => { seekingRef.current = val }, [])

  const setVolume = useCallback((vol) => {
    dispatch({ type: 'SET_VOLUME', volume: vol })
    window.electronAPI?.settings.set('volume', vol)
  }, [])

  const toggleShuffle = useCallback(() => {
    const { queue } = stateRef.current
    shuffledQueueRef.current = shuffleArray([...queue])
    dispatch({ type: 'TOGGLE_SHUFFLE' })
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

  // Append a single track to the end of the current queue
  const addToQueue = useCallback((track) => {
    if (!track) return
    const { queue } = stateRef.current
    const newQueue = [...queue, track]
    shuffledQueueRef.current = [...shuffledQueueRef.current, track]
    dispatch({ type: 'SET_QUEUE', queue: newQueue, index: stateRef.current.queueIndex })
    dispatch({ type: 'SET_SHUFFLED_QUEUE', queue: shuffledQueueRef.current })
  }, [])

  const setCrossfadeTime = useCallback((seconds) => {
    const s = Math.max(0, Math.min(10, seconds))
    dispatch({ type: 'SET_CROSSFADE', seconds: s })
    engineRef.current?.setCrossfadeTime(s)
    window.electronAPI?.settings.set('playback', { ...{}, crossfade: s })
  }, [])

  const setEqBand = useCallback((freq, gain) => {
    engineRef.current?.setEqBand(freq, gain)
  }, [])

  const applyEqPreset = useCallback((preset) => {
    return engineRef.current?.applyEqPreset(preset)
  }, [])

  const getAnalyser = useCallback(() => engineRef.current?.analyserNode || null, [])
  const getEngine   = useCallback(() => engineRef.current, [])

  return (
    <PlayerContext.Provider value={{
      state,
      playTrack, togglePlay, nextTrack, prevTrack,
      seek, setSeeking, setVolume, toggleShuffle, cycleRepeat,
      setQueue, addToQueue, setCrossfadeTime,
      setEqBand, applyEqPreset,
      getAnalyser, getEngine,
    }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be inside PlayerProvider')
  return ctx
}
