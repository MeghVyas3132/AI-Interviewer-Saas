'use client';

import { useMemo } from 'react';
import { useAssemblyAIRealtime } from '@/hooks/use-assemblyai-realtime';

export default function AssemblyAIStreamExamplePage() {
  const {
    start,
    stop,
    resetTranscripts,
    status,
    error,
    partialTranscript,
    segments,
  } = useAssemblyAIRealtime();

  const finalTranscript = useMemo(
    () => segments.map(segment => segment.text).join(' '),
    [segments],
  );

  const isActive = status === 'listening';
  const disableStart = status === 'connecting' || status === 'listening';

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-lg">
        <p className="text-sm uppercase tracking-wide text-emerald-400">
          Realtime Speech-To-Text
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-white">
          AssemblyAI Streaming Demo
        </h1>
        <p className="mt-3 text-sm text-neutral-400">
          Streams microphone audio to AssemblyAI&apos;s streaming Speech-to-Text
          WebSocket API, then renders transcripts incrementally as they arrive.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={disableStart}
            onClick={start}
            className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            {status === 'connecting' ? 'Connecting…' : 'Start Listening'}
          </button>
          <button
            type="button"
            disabled={!isActive}
            onClick={stop}
            className="rounded-full border border-neutral-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Stop
          </button>
          <button
            type="button"
            onClick={resetTranscripts}
            className="rounded-full border border-transparent px-5 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={segments.length === 0 && !partialTranscript}
          >
            Clear Transcript
          </button>
        </div>
        <div className="mt-4 text-sm text-neutral-400">
          Status:{' '}
          <span
            className={
              status === 'listening'
                ? 'text-emerald-400'
                : status === 'error'
                  ? 'text-rose-400'
                  : 'text-neutral-200'
            }
          >
            {status}
          </span>
        </div>
        {error && (
          <p className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
      </header>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-white">Live Transcript</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Finalized phrases are shown in bold. In-progress text updates in real
          time beneath them.
        </p>
        <div className="mt-4 rounded-xl border border-neutral-800 bg-black/40 p-4 text-base text-white">
          <p className="whitespace-pre-wrap leading-relaxed">
            <span className="font-medium text-white">{finalTranscript}</span>
            {partialTranscript && (
              <span className="animate-pulse text-neutral-400">
                {' '}
                {partialTranscript}
              </span>
            )}
            {(!finalTranscript && !partialTranscript) && (
              <span className="text-neutral-500">Start speaking…</span>
            )}
          </p>
        </div>

        {segments.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Transcript timeline
            </h3>
            <ul className="space-y-3">
              {segments.map(segment => (
                <li
                  key={segment.id}
                  className="rounded-xl border border-neutral-800 bg-black/30 p-3"
                >
                  <p className="text-sm uppercase text-neutral-500">
                    {new Date(segment.timestamp).toLocaleTimeString()}
                  </p>
                  <p className="text-base text-neutral-100">{segment.text}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

