import { useRef, useState, useEffect } from 'react'

/**
 * useSpeech — lightweight Web Speech API wrapper
 * Returns { speak, stop, speaking, supported }
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false)
  const utteranceRef = useRef(null)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    // Clean up on unmount
    return () => { if (supported) window.speechSynthesis.cancel() }
  }, [])

  function speak(text, lang = 'en-US') {
    if (!supported || !text) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang
    utter.rate = 0.9
    utter.pitch = 1
    utter.onstart = () => setSpeaking(true)
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    utteranceRef.current = utter
    window.speechSynthesis.speak(utter)
  }

  function stop() {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  return { speak, stop, speaking, supported }
}

/**
 * SpeakButton — a small 🔊 button that reads `text` aloud.
 * Props: text (string), size ('sm' | 'md'), className
 */
export function SpeakButton({ text, size = 'sm', className = '', title = 'Listen' }) {
  const { speak, stop, speaking, supported } = useSpeech()
  if (!supported) return null

  function handleClick(e) {
    e.stopPropagation()
    if (speaking) { stop() } else { speak(text) }
  }

  return (
    <button
      className={`speak-btn ${size === 'md' ? 'speak-btn-md' : ''} ${className}`}
      onClick={handleClick}
      title={speaking ? 'Stop' : title}
      aria-label={speaking ? 'Stop audio' : title}
    >
      <span className={`speak-icon ${speaking ? 'speaking' : ''}`}>
        {speaking ? '⏹' : '🔊'}
      </span>
    </button>
  )
}
