# Norwegian voice: a working view

Checked 27 October 2026. This note separates published evidence from measurements in this lab.

## 1. What has changed?

Norwegian-specific recognition is worth testing alongside global speech APIs. The older NB-Whisper paper reports Bokmål WER of 6.6% on FLEURS and 2.2% on NST, versus 10.4% and 6.8% for Whisper Large-v3. Those results establish a useful historical baseline; they are not scores for the current beta or a guarantee for phone calls. [NB-Whisper paper, Interspeech 2024](https://www.isca-archive.org/interspeech_2024/kummervold24_interspeech.html).

The recent development at NbAiLab is Qwen-based NB-ASR “Bokfink”. Version 0.2 was created on 19 October; 0.2.1 in 0.6B and 1.7B variants on 25 October. Explicit controls select Bokmål/Nynorsk, readable/verbatim output and vocabulary context. The current helper does not validate streaming. Its seven-recording long-form cohort reports 23.90% versus 18.27% WER for the two sizes, favouring 1.7B. This is publisher evaluation, not our result. Scores cap per-clip WER; Nynorsk references are machine-translated and not fully reviewed. Do not compare these numbers directly with the 2024 Whisper paper. [Bokfink 0.2.1 card](https://huggingface.co/NbAiLab/nb-asr-qwen06b-bokfink021-beta), [0.2 repository](https://huggingface.co/NbAiLab/nb-asr-qwen06b-bokfink02-beta).

On synthesis, NbAiLab demonstrates Norwegian male/female Oslo voices with Piper and VoxCPM2 “Opplest”. Their underlying checkpoints were inaccessible to the configured Hugin account when checked, so this deployment uses the open Piper Talesyntese voice as its working fallback. That voice has one speaker and a CC0 source dataset; it does not provide a choice of Norwegian dialects. [NbAiLab Piper demo](https://huggingface.co/spaces/NbAiLab/nb-tts-norwegian-piper-demo), [Opplest demo](https://huggingface.co/spaces/NbAiLab/nb-tts-voxcpm2-voices-2607-demo), [fallback voice card](https://huggingface.co/rhasspy/piper-voices/blob/main/no/no_NO/talesyntese/medium/MODEL_CARD).

For agents, the useful change is the combination of streaming recognition, turn handling, speech generation and tool calls. ElevenLabs documents Norwegian STT and TTS, with turn-taking/interruptions and external tools in ElevenAgents. Speechmatics documents Norwegian in its realtime speech offering. Their latency figures are vendor measurements, not end-of-speech-to-audible-answer timings from a Norwegian contact centre. [ElevenLabs STT](https://elevenlabs.io/docs/overview/capabilities/speech-to-text), [TTS](https://elevenlabs.io/docs/speech-synthesis/voice-settings), [ElevenAgents](https://elevenlabs.io/docs/eleven-agents/overview/), [Speechmatics languages](https://docs.speechmatics.com/speech-to-text/languages).

## 2. How good are Norwegian and dialects?

The claim that recognition simply “cannot do Norwegian” is too broad. The National Library’s 2024 evaluation found strong systems for both written standards; overlap remained troublesome. It is historical evidence, not an up-to-date vendor league table. [Full evaluation](https://www.nb.no/sbfil/dok/2024_talegjenkjenning.pdf).

Dialect and written standard are separate choices. A speaker from Bergen or Tromsø can request Bokmål or Nynorsk. A transcript written in correct standard Norwegian may legitimately differ from the speaker’s exact words. Score against a reference in the requested standard and style; retain names, numbers and negations as separate critical fields.

A single WER average can hide a bad customer experience. Test East, West, Trøndelag, North and South with several speakers per region. Add spontaneous repairs, names, amounts, dates, line noise, background voices, silence and code-switching. NB Samtale is a useful additional public corpus: conversational speech from 69 speakers, five dialect areas, both standards. This lab’s initial FLEURS samples are read Bokmål speech and cannot answer the dialect question. [NB Samtale](https://www.nb.no/sprakbanken/ressurskatalog/en/oai-nb-no-sbr-85/).

The colleague’s assumptions about Norwegian customer preference and voice-bot adoption should be treated as hypotheses. A model benchmark cannot establish adoption, willingness to use bots or whether easy access to a human improves completion. Those need user/customer-service evidence.

## 3. What would I demo?

For this local experiment, start with **NB-Whisper Distil Turbo → Borealis2 → Piper**, alongside NB-Whisper Large, the accessible Bokfink 0.2 beta and upstream Whisper Turbo on identical audio. Borealis2 is already installed on Hugin; it is a Norwegian-centric preview model, so keep the task narrow and use fictional company facts. The first release is push-to-talk and processes complete turns; it is not a validated streaming voice agent. [Borealis2 card](https://huggingface.co/NbAiLab/borealis2-26b-a4b-preview).

Next, obtain access to **Bokfink 0.2.1 0.6B and 1.7B** and repeat the same tests. The larger checkpoint is a promising quality candidate; the smaller one is a latency candidate. Neither is a winner until measured on representative calls. NbAiLab TTS should be added when checkpoint access and a compatible runtime are available.

For a polished hosted demo, my first comparator would be **ElevenLabs**, using a Norwegian voice and explicit language configuration. This is a practical integration choice based on its documented speech/agent capabilities, not an independently measured Norwegian dialect ranking. Include **Speechmatics** in an STT comparison where recognition and terminology control matter.

Use a task such as “find my invoice” with a visible route to a person. Judge task completion, wrong names/numbers, clarification burden, end-of-speech to first audible reply, interruption recovery and handoff. For a first pilot, recruit at least three speakers from each of the five regions and run the same ten tasks. Record preferences after they have tried both the bot and a human-access option.

## How this lab measures

- Inference runs sequentially on Hugin’s shared GB10. Model-load time is separate from inference. Different models use their appropriate FP16/BF16 runtime; timings compare deployments, not architecture alone.
- RTF is inference seconds divided by audio seconds. It is throughput, not conversational latency. The UI also reports queue/network/server roundtrip and server stage timings. Actual playback start must be measured in a live user test.
- WER is uncapped edit distance divided by reference-word count. Case, punctuation and whitespace are normalized; Norwegian letters and digit/word distinctions are preserved. CER includes normalized spaces. Empty references have no WER.
- The narrowband option downsamples to 8 kHz and returns to 16 kHz. It does not emulate a full telephone codec, packet loss or a telephone network.
- Initial public samples are from the FLEURS `nb_no` test split, with SHA-256 hashes and references retained on Hugin. FLEURS is CC-BY-4.0. They are not a held-out dialect/customer-service corpus and possible training overlap is not ruled out. [FLEURS dataset](https://huggingface.co/datasets/google/fleurs).
- Human handoff is simulated; the fictional agent has no access to accounts or customer systems. No hosted speech provider receives audio in this deployment.

## First measured pilot on Hugin

20 FLEURS Bokmål read-speech clips, 231.48 seconds, 389 reference words. Same recordings and normalization for every model; no vocabulary hints or bandwidth simulation.

| Model | Word errors | Corpus WER | Median warm inference |
|---|---:|---:|---:|
| NB-Whisper Large | 20 | 5.14% | 0.787 s |
| Bokfink 0.2, 0.6B | 22 | 5.66% | 0.552 s |
| NB-Whisper Distil Turbo | 34 | 8.74% | 0.208 s |
| Whisper Large v3 Turbo | 35 | 9.00% | 0.266 s |

Large gives the lowest word-error count in this small sample; Bokfink is only two errors behind. The distilled model is a useful responsiveness candidate, with a visible accuracy tradeoff here. These observations do not establish a dialect winner. Timings exclude load, queue, network and playback and compare the actual FP16/BF16 deployments. No failures occurred in these 80 model/clip calls. [Aggregate measurements and pinned revisions](pilot.json).
