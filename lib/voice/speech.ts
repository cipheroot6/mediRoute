import { SPEECH_RATE, SPEECH_PITCH, SPEECH_VOLUME } from '@/lib/constants'

let synth: SpeechSynthesis | null = null
let voices: SpeechSynthesisVoice[] = []

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  if (!synth) {
    synth = window.speechSynthesis
    voices = synth.getVoices()
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = () => {
        if (synth) voices = synth.getVoices()
      }
    }
  }
  return synth
}

export function speakCue(text: string) {
  const s = getSynth()
  if (!s) return

  // Cancel current speech before new cue
  s.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = SPEECH_RATE
  utterance.pitch = SPEECH_PITCH
  utterance.volume = SPEECH_VOLUME

  // Prefer a local voice to avoid network dependency
  const availableVoices = voices.length > 0 ? voices : s.getVoices()
  const preferred = availableVoices.find(v => v.lang.startsWith('en') && v.localService)
  if (preferred) utterance.voice = preferred

  s.speak(utterance)
}

export function cancelSpeech() {
  getSynth()?.cancel()
}
